import type { Db } from '../db/types';
import { evaluarLectura, type ConfigGps, type Lectura, type ModoTraslado, type MotivoRechazo, type PuntoAceptado } from '../domain/gpsFilter';
import { detectarPermanencias, resumirActividad, type Permanencia, type ResumenActividad } from '../domain/permanencias';
import { ETIQUETAS_PARADA, type OrigenRuta, type Ruta, type RutaEvento, type RutaPunto } from '../domain/types';
import { now, uuid } from '../platform/runtime';
import { auditar } from '../repositories/auditoria';
import * as campanas from '../repositories/campanas';
import * as repo from '../repositories/rutas';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

/**
 * Máquina de estados del recorrido:
 *   Iniciar → EN_CURSO; Pausar → PAUSADA; Reanudar → EN_CURSO (nuevo segmento); Finalizar → FINALIZADA.
 *   Si la app se reinicia sin captura activa → INTERRUMPIDA (se pide reanudar o finalizar).
 * La duración activa se acumula al pausar/finalizar/interrumpir; nunca se inventan posiciones ni tramos.
 */

export async function rutaAbierta(db: Db): Promise<Ruta | null> {
  return repo.abierta(db);
}

export async function iniciar(
  db: Db,
  actor: Actor,
  p: { campanaId: string; modo: ModoTraslado; dispositivoId: string; origen?: OrigenRuta; inicioMs?: number },
): Promise<Ruta> {
  exigir(actor.rol, 'ruta.capturar');
  const ts = p.inicioMs ?? now();
  const ruta: Ruta = {
    id: uuid(), campana_id: p.campanaId, usuario_id: actor.id, dispositivo_id: p.dispositivoId, estado: 'EN_CURSO',
    inicio_ms: ts, fin_ms: null, activo_ms: 0, distancia_m: 0, segmento_actual: 0, tramo_inicio_ms: ts,
    saltos_consecutivos: 0, modo_traslado: p.modo, origen: p.origen ?? 'CAPTURA', ultimo_punto_ms: null,
  };
  await db.transaction(async (tx) => {
    const abierta = await repo.abierta(tx);
    if (abierta) throw new ErrorNegocio('Ya existe un recorrido sin finalizar en este dispositivo.');
    const c = await campanas.porId(tx, p.campanaId);
    if (!c || c.estado !== 'ACTIVA') throw new ErrorNegocio('Seleccione una campaña activa antes de iniciar el recorrido.');
    await repo.insertar(tx, ruta);
    await repo.evento(tx, ruta.id, 'INICIO', p.modo, ts);
    await auditar(tx, { usuarioId: actor.id, entidad: 'rutas', entidadId: ruta.id, accion: 'RUTA_INICIAR' });
  });
  return ruta;
}

async function cargar(db: Db, id: string): Promise<Ruta> {
  const r = await repo.porId(db, id);
  if (!r) throw new ErrorNegocio('Recorrido no encontrado.');
  return r;
}

export async function pausar(db: Db, actor: Actor, id: string, ts = now()): Promise<Ruta> {
  exigir(actor.rol, 'ruta.capturar');
  return db.transaction(async (tx) => {
    const r = await cargar(tx, id);
    if (r.estado !== 'EN_CURSO') throw new ErrorNegocio('Solo se puede pausar un recorrido en curso.');
    const activo = r.activo_ms + Math.max(0, ts - (r.tramo_inicio_ms ?? ts));
    await repo.actualizarEstado(tx, id, { estado: 'PAUSADA', activo_ms: activo, segmento_actual: r.segmento_actual, tramo_inicio_ms: null });
    await repo.evento(tx, id, 'PAUSA', null, ts);
    await auditar(tx, { usuarioId: actor.id, entidad: 'rutas', entidadId: id, accion: 'RUTA_PAUSAR' });
    return cargar(tx, id);
  });
}

export async function reanudar(db: Db, actor: Actor, id: string, ts = now()): Promise<Ruta> {
  exigir(actor.rol, 'ruta.capturar');
  return db.transaction(async (tx) => {
    const r = await cargar(tx, id);
    if (r.estado !== 'PAUSADA' && r.estado !== 'INTERRUMPIDA') throw new ErrorNegocio('El recorrido no está pausado ni interrumpido.');
    // Nuevo segmento: no se une el tramo anterior con el nuevo.
    await repo.actualizarEstado(tx, id, { estado: 'EN_CURSO', activo_ms: r.activo_ms, segmento_actual: r.segmento_actual + 1, tramo_inicio_ms: ts, saltos_consecutivos: 0 });
    await repo.evento(tx, id, 'REANUDA', `segmento ${r.segmento_actual + 1}`, ts);
    await auditar(tx, { usuarioId: actor.id, entidad: 'rutas', entidadId: id, accion: 'RUTA_REANUDAR' });
    return cargar(tx, id);
  });
}

export async function finalizar(db: Db, actor: Actor, id: string, ts = now()): Promise<Ruta> {
  exigir(actor.rol, 'ruta.capturar');
  return db.transaction(async (tx) => {
    const r = await cargar(tx, id);
    if (r.estado === 'FINALIZADA') throw new ErrorNegocio('El recorrido ya fue finalizado.');
    const activo = r.estado === 'EN_CURSO' ? r.activo_ms + Math.max(0, ts - (r.tramo_inicio_ms ?? ts)) : r.activo_ms;
    await repo.actualizarEstado(tx, id, { estado: 'FINALIZADA', activo_ms: activo, segmento_actual: r.segmento_actual, tramo_inicio_ms: null, fin_ms: ts });
    await repo.evento(tx, id, 'FIN', null, ts);
    await auditar(tx, { usuarioId: actor.id, entidad: 'rutas', entidadId: id, accion: 'RUTA_FINALIZAR' });
    return cargar(tx, id);
  });
}

/**
 * Recuperación tras reinicio de la app sin captura activa: el tiempo activo se cuenta solo hasta la última lectura
 * real (o el inicio del tramo), nunca hasta "ahora", para no inventar actividad.
 */
export async function marcarInterrumpida(db: Db, id: string, motivo: string): Promise<Ruta> {
  return db.transaction(async (tx) => {
    const r = await cargar(tx, id);
    if (r.estado !== 'EN_CURSO') return r;
    const tramo = r.tramo_inicio_ms ?? r.inicio_ms;
    const hasta = Math.max(tramo, r.ultimo_punto_ms ?? tramo);
    await repo.actualizarEstado(tx, id, { estado: 'INTERRUMPIDA', activo_ms: r.activo_ms + (hasta - tramo), segmento_actual: r.segmento_actual, tramo_inicio_ms: null });
    await repo.evento(tx, id, 'INTERRUPCION', motivo);
    await auditar(tx, { usuarioId: null, entidad: 'rutas', entidadId: id, accion: 'RUTA_INTERRUMPIDA', detalle: motivo });
    return cargar(tx, id);
  });
}

export interface ResultadoIngesta {
  aceptados: number;
  rechazados: Partial<Record<MotivoRechazo | 'ruta_inactiva', number>>;
  nuevosSegmentos: number;
  ultimo: PuntoAceptado | null;
  distanciaM: number;
}

/**
 * Persiste lecturas GPS en una transacción: filtra, inserta puntos y actualiza acumulados.
 * Se invoca tanto desde la captura en primer plano como desde la tarea en segundo plano (sin interfaz).
 */
export async function registrarLecturas(db: Db, rutaId: string, lecturas: Lectura[], cfg: ConfigGps): Promise<ResultadoIngesta> {
  const ordenadas = [...lecturas].sort((a, b) => a.fechaMs - b.fechaMs);
  return db.transaction(async (tx) => {
    const r = await repo.porId(tx, rutaId);
    const res: ResultadoIngesta = { aceptados: 0, rechazados: {}, nuevosSegmentos: 0, ultimo: null, distanciaM: r?.distancia_m ?? 0 };
    if (!r || r.estado !== 'EN_CURSO' || r.tramo_inicio_ms == null) {
      res.rechazados.ruta_inactiva = ordenadas.length;
      return res;
    }
    const up = await repo.ultimoPunto(tx, rutaId);
    let est = {
      segmentoActual: r.segmento_actual,
      tramoInicioMs: r.tramo_inicio_ms,
      ultimo: up ? { lat: up.lat, lon: up.lon, precision: up.precision_m, fechaMs: up.fecha_ms, segmento: up.segmento } : null,
      saltosConsecutivos: r.saltos_consecutivos,
    };
    let distanciaTotal = 0;
    for (const l of ordenadas) {
      const d = evaluarLectura(l, est, { ...cfg, modo: r.modo_traslado });
      if (d.tipo === 'rechazar') {
        res.rechazados[d.motivo] = (res.rechazados[d.motivo] ?? 0) + 1;
        if (d.motivo === 'salto') est = { ...est, saltosConsecutivos: est.saltosConsecutivos + 1 };
        continue;
      }
      const punto: PuntoAceptado = { lat: l.lat, lon: l.lon, precision: l.precision ?? null, fechaMs: Math.round(l.fechaMs), segmento: d.segmento };
      const insertado = await repo.insertarPunto(tx, {
        id: uuid(), ruta_id: rutaId, segmento: punto.segmento, fecha_ms: punto.fechaMs, lat: punto.lat, lon: punto.lon, precision_m: punto.precision,
      });
      if (!insertado) {
        res.rechazados.repetida = (res.rechazados.repetida ?? 0) + 1;
        continue;
      }
      if (d.nuevoSegmento) {
        res.nuevosSegmentos++;
        await repo.evento(tx, rutaId, d.motivoSegmento === 'senal' ? 'PERDIDA_SENAL' : 'REPOSICION', `segmento ${d.segmento}`, punto.fechaMs);
      }
      distanciaTotal += d.distanciaSumada;
      est = { ...est, segmentoActual: d.segmento, ultimo: punto, saltosConsecutivos: 0 };
      res.aceptados++;
      res.ultimo = punto;
    }
    await repo.acumular(tx, rutaId, {
      distanciaSumada: distanciaTotal, segmento: est.segmentoActual, saltos: est.saltosConsecutivos, ultimoPuntoMs: res.ultimo?.fechaMs ?? null,
    });
    res.distanciaM = r.distancia_m + distanciaTotal;
    return res;
  });
}

export async function agregarParada(db: Db, actor: Actor, rutaId: string, etiqueta: string, pos: { lat: number; lon: number } | null): Promise<void> {
  exigir(actor.rol, 'ruta.capturar');
  if (!(ETIQUETAS_PARADA as readonly string[]).includes(etiqueta)) throw new ErrorNegocio('Etiqueta de parada no permitida.');
  await db.transaction(async (tx) => {
    const r = await cargar(tx, rutaId);
    if (r.estado === 'FINALIZADA') throw new ErrorNegocio('El recorrido ya fue finalizado.');
    let p = pos;
    if (!p) {
      const up = await repo.ultimoPunto(tx, rutaId);
      if (!up) throw new ErrorNegocio('Aún no hay una posición válida para marcar la parada.');
      p = { lat: up.lat, lon: up.lon };
    }
    await repo.insertarParada(tx, { id: uuid(), ruta_id: rutaId, fecha_ms: now(), etiqueta, lat: p.lat, lon: p.lon });
    await repo.evento(tx, rutaId, 'PARADA', etiqueta);
  });
}

export async function eliminarParada(db: Db, actor: Actor, paradaId: string): Promise<void> {
  exigir(actor.rol, 'ruta.capturar');
  await repo.eliminarParada(db, paradaId);
}

/** Actividad detectada automáticamente (brigada / paradas / desplazamiento) a partir de puntos y marcas de atención. */
export function calcularActividad(ruta: Ruta, puntos: RutaPunto[], eventos: RutaEvento[], ahoraMs = now()): { permanencias: Permanencia[]; resumen: ResumenActividad } {
  const atencionesMs = eventos.filter((e) => e.tipo === 'ATENCION').map((e) => e.fecha_ms);
  const permanencias = detectarPermanencias(puntos.map((p) => ({ lat: p.lat, lon: p.lon, fechaMs: p.fecha_ms, segmento: p.segmento })), atencionesMs);
  const activo = ruta.estado === 'EN_CURSO' && ruta.tramo_inicio_ms ? ruta.activo_ms + Math.max(0, ahoraMs - ruta.tramo_inicio_ms) : ruta.activo_ms;
  return { permanencias, resumen: resumirActividad(permanencias, activo, atencionesMs.length) };
}

export async function detalle(db: Db, actor: Actor, id: string) {
  exigir(actor.rol, 'ruta.ver');
  const [ruta, puntos, paradas, eventos] = await Promise.all([cargar(db, id), repo.puntos(db, id), repo.paradas(db, id), repo.eventos(db, id)]);
  return { ruta, puntos, paradas, eventos, ...calcularActividad(ruta, puntos, eventos) };
}

export async function listar(db: Db, actor: Actor, campanaId?: string | null) {
  exigir(actor.rol, 'ruta.ver');
  return repo.listar(db, campanaId);
}

/** Plazo de conservación: elimina rutas finalizadas más antiguas que `dias`. */
export async function depurar(db: Db, actor: Actor, dias: number): Promise<number> {
  exigir(actor.rol, 'seguridad.gestionar');
  const limite = now() - dias * 86_400_000;
  return db.transaction(async (tx) => {
    const n = await repo.depurarAntesDe(tx, limite);
    await auditar(tx, { usuarioId: actor.id, entidad: 'rutas', accion: 'RUTA_DEPURAR', detalle: `${n} rutas > ${dias} días` });
    return n;
  });
}

/** Agrupa puntos por segmento para dibujar polilíneas independientes. */
export function segmentosDe<T extends { segmento: number }>(puntos: T[]): T[][] {
  const mapa = new Map<number, T[]>();
  for (const p of puntos) {
    const arr = mapa.get(p.segmento);
    if (arr) arr.push(p);
    else mapa.set(p.segmento, [p]);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
