import type { Db } from '../db/types';
import { generalizar, longitud } from '../domain/geo';
import { fechaISO } from '../domain/time';
import type { Evaluacion, EvaluacionSesion, Ruta, RutaEvento, RutaParada, RutaPunto } from '../domain/types';
import { auditar } from '../repositories/auditoria';
import * as evalRepo from '../repositories/evaluacion';
import * as rutasRepo from '../repositories/rutas';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';
import { calcularActividad, segmentosDe } from './rutaService';

/**
 * Celda CSV segura: comillas escapadas y neutralización de inyección de fórmulas (OWASP CSV Injection):
 * valores que inician con = + - @ tab o CR se prefijan con apóstrofo.
 */
export function celdaCsv(v: string | number | null | undefined): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",;\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function aCsv(encabezados: string[], filas: (string | number | null)[][]): string {
  // BOM UTF-8 para que Excel reconozca acentos.
  return '﻿' + [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n';
}

/**
 * Matriz académica desidentificada: código aleatorio, método, operador (código), tiempos, errores, faltantes,
 * correcciones, conectividad y guardado. Sin nombres, teléfonos, cédulas, coordenadas ni signos vitales,
 * y sin el identificador de la atención (evita re-vincular con el registro clínico).
 */
export function csvMatriz(filas: Evaluacion[]): string {
  return aCsv(
    ['codigo', 'campana_id', 'fecha', 'metodo', 'operador', 'tiempo_s', 'tiempo_busqueda_s', 'errores_validacion',
      'errores_verificados', 'campos_faltantes', 'correcciones', 'conectividad', 'guardado_exitoso'],
    filas.map((e) => [
      e.codigo, e.campana_id, fechaISO(e.creado_at), e.metodo, e.operador, e.duracion_s, e.tiempo_busqueda_s, e.errores_validacion,
      e.errores_verificados, e.incompletos, e.correcciones, e.conectividad, e.guardado_exitoso,
    ]),
  );
}

export function csvSesiones(filas: EvaluacionSesion[]): string {
  return aCsv(
    ['campana_id', 'fecha', 'operador', 'metodo', 'satisfaccion_1_5', 'tiempo_consolidacion_s', 'hojas_papel'],
    filas.map((s) => [s.campana_id, fechaISO(s.fecha), s.operador, s.metodo, s.satisfaccion, s.tiempo_consolidacion_s, s.hojas_papel]),
  );
}

export interface DatosRutaGeo {
  ruta: Ruta;
  puntos: RutaPunto[];
  paradas: RutaParada[];
  eventos?: RutaEvento[];
}

/**
 * GeoJSON (RFC 7946: [lon, lat]): una LineString por segmento y un Point por parada general.
 * `generalizada` redondea a ~110 m para informes académicos. Considerado información sensible.
 */
export function geojson(rutas: DatosRutaGeo[], generalizada: boolean): string {
  const tr = (p: { lat: number; lon: number }) => {
    const g = generalizada ? generalizar(p) : p;
    return [Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))];
  };
  const features: unknown[] = [];
  for (const { ruta, puntos, paradas, eventos } of rutas) {
    for (const seg of segmentosDe(puntos)) {
      if (seg.length < 2) continue;
      const coords = seg.map(tr).filter((c, i, arr) => i === 0 || c[0] !== arr[i - 1][0] || c[1] !== arr[i - 1][1]);
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {
          ruta_id: ruta.id, campana_id: ruta.campana_id, dispositivo_id: ruta.dispositivo_id, segmento: seg[0].segmento,
          origen: ruta.origen, inicio: new Date(seg[0].fecha_ms).toISOString(), fin: new Date(seg[seg.length - 1].fecha_ms).toISOString(),
          distancia_estimada_m: Math.round(longitud(seg)), puntos: seg.length,
        },
      });
    }
    for (const pa of paradas) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: tr(pa) },
        properties: { ruta_id: ruta.id, tipo: 'parada', etiqueta: pa.etiqueta, fecha: new Date(pa.fecha_ms).toISOString() },
      });
    }
    // Actividad detectada automáticamente: punto de brigada (toma de signos) o parada.
    for (const pe of calcularActividad(ruta, puntos, eventos ?? []).permanencias) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: tr(pe) },
        properties: {
          ruta_id: ruta.id, tipo: pe.tipo === 'BRIGADA' ? 'brigada' : 'parada_detectada', inicio: new Date(pe.inicioMs).toISOString(),
          fin: new Date(pe.finMs).toISOString(), duracion_s: Math.round(pe.duracionMs / 1000), atenciones: pe.atenciones,
        },
      });
    }
  }
  return JSON.stringify({
    type: 'FeatureCollection',
    metadata: {
      generador: 'Vitalis Pifo',
      generalizada,
      aviso: 'Información sensible: recorrido del equipo de campaña. No compartir públicamente sin revisión.',
    },
    features,
  });
}

export async function prepararCsvMatriz(db: Db, actor: Actor, campanaId: string | null) {
  exigir(actor.rol, 'exportar.metricas');
  const filas = await evalRepo.listar(db, campanaId);
  if (filas.length === 0) throw new ErrorNegocio('No hay registros de evaluación para exportar.');
  await auditar(db, { usuarioId: actor.id, entidad: 'evaluacion', accion: 'EXPORTAR_CSV', detalle: `${filas.length} filas` });
  return { contenido: csvMatriz(filas), filas: filas.length };
}

export async function prepararCsvSesiones(db: Db, actor: Actor, campanaId: string | null) {
  exigir(actor.rol, 'exportar.metricas');
  const filas = await evalRepo.sesiones(db, campanaId);
  if (filas.length === 0) throw new ErrorNegocio('No hay encuestas de satisfacción registradas.');
  await auditar(db, { usuarioId: actor.id, entidad: 'evaluacion_sesion', accion: 'EXPORTAR_CSV', detalle: `${filas.length} filas` });
  return { contenido: csvSesiones(filas), filas: filas.length };
}

export async function prepararGeojson(db: Db, actor: Actor, p: { rutaId?: string; campanaId?: string | null; generalizada: boolean }) {
  exigir(actor.rol, 'exportar.geojson');
  const ids = p.rutaId ? [p.rutaId] : (await rutasRepo.listar(db, p.campanaId)).map((r) => r.id);
  if (ids.length === 0) throw new ErrorNegocio('No hay recorridos para exportar.');
  const datos: DatosRutaGeo[] = [];
  for (const id of ids) {
    const ruta = await rutasRepo.porId(db, id);
    if (!ruta) continue;
    datos.push({ ruta, puntos: await rutasRepo.puntos(db, id), paradas: await rutasRepo.paradas(db, id), eventos: await rutasRepo.eventos(db, id) });
  }
  await auditar(db, { usuarioId: actor.id, entidad: 'rutas', entidadId: p.rutaId ?? null, accion: 'EXPORTAR_GEOJSON', detalle: `${datos.length} rutas, generalizada=${p.generalizada}` });
  return { contenido: geojson(datos, p.generalizada), rutas: datos.length };
}
