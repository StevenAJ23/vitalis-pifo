import type { Db } from '../db/types';
import { CONFIG_GPS_DEFECTO, type Lectura } from '../domain/gpsFilter';
import { now, randomBytes } from '../platform/runtime';
import { leerAjuste } from '../repositories/ajustes';
import { auditar } from '../repositories/auditoria';
import * as rutasRepo from '../repositories/rutas';
import { ATENCION_FORM_VACIO, type AtencionForm } from '../schemas/atencion';
import { PACIENTE_FORM_VACIO } from '../schemas/paciente';
import { exigir } from '../security/permissions';
import * as atenciones from './atencionService';
import { ErrorNegocio, type Actor } from './contexto';
import * as pacientes from './pacienteService';
import * as rutas from './rutaService';

/** Generador pseudoaleatorio con semilla criptográfica (solo para datos de prueba). */
function rng() {
  let s = new DataView(randomBytes(4).buffer).getUint32(0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const NOMBRES = ['Ana', 'Luis', 'María', 'Jorge', 'Rosa', 'Pedro', 'Carmen', 'Diego', 'Lucía', 'Andrés', 'Elena', 'Marco'];
const APELLIDOS_FICTICIOS = ['Ficticio', 'Simulado', 'Ejemplo', 'Prueba', 'Demostración'];
const APELLIDOS = ['Andrade', 'Quishpe', 'Morales', 'Tipán', 'Guamán', 'Herrera', 'Simbaña', 'Cevallos'];
const SECTORES = ['Pifo Centro', 'La Toglla', 'Itulcachi', 'Palugo', 'El Inga', 'Mulauco'];
/** Plaza de Pifo (aprox.), solo como origen del recorrido sintético. */
const ORIGEN = { lat: -0.2311, lon: -78.3383 };

/**
 * Genera pacientes, atenciones, evaluaciones y (si no hay ruta abierta) un recorrido, todos marcados como
 * sintéticos y creados por los mismos servicios que usa la app (validan el flujo completo).
 * Solo disponible en modo SINTETICO.
 */
export async function generar(db: Db, actor: Actor, campanaId: string, cantidad: number) {
  exigir(actor.rol, 'datos.sinteticos');
  if ((await leerAjuste(db, 'modo_datos')) !== 'SINTETICO') throw new ErrorNegocio('Los datos ficticios solo se generan en modo de prueba.');
  if (cantidad < 1 || cantidad > 200) throw new ErrorNegocio('Cantidad entre 1 y 200.');
  const r = rng();
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const entre = (a: number, b: number, dec = 0) => Number((a + r() * (b - a)).toFixed(dec));
  let creados = 0;
  for (let i = 0; i < cantidad; i++) {
    const p = await pacientes.crear(db, actor, {
      ...PACIENTE_FORM_VACIO,
      nombres: pick(NOMBRES),
      apellidos: `${pick(APELLIDOS_FICTICIOS)} ${pick(APELLIDOS)}`,
      edad: String(Math.floor(entre(1, 90))),
      sector: pick(SECTORES),
    });
    const completo = r() > 0.15;
    const sis = Math.round(entre(100, 150));
    const form: AtencionForm = {
      ...ATENCION_FORM_VACIO,
      sistolica: String(sis),
      diastolica: String(Math.round(entre(60, Math.min(95, sis - 20)))),
      frecuencia: String(Math.round(entre(60, 100))),
      temperatura: entre(36, 37.4, 1).toFixed(1),
      spo2: completo ? String(Math.round(entre(93, 99))) : '',
      peso: entre(45, 95, 1).toFixed(1),
      talla_cm: completo ? String(Math.round(entre(145, 185))) : '',
      oido_i: pick(['SI', 'NO', 'NO_EVALUADO'] as const),
      oido_d: pick(['SI', 'NO', 'NO_EVALUADO'] as const),
      seguimiento: r() > 0.8,
    };
    const inicio = now() - Math.round(entre(40, 150) * 1000);
    await atenciones.registrar(db, actor, {
      pacienteId: p.id, campanaId, form, atipicosConfirmados: true,
      medicion: { inicioMs: inicio, busquedaS: entre(3, 25, 1), erroresValidacion: r() > 0.85 ? 1 : 0, conectividad: 'SIN_CONEXION' },
    });
    creados++;
  }
  let rutaId: string | null = null;
  if (!(await rutasRepo.abierta(db))) {
    const ini = now() - 45 * 60_000;
    const ruta = await rutas.iniciar(db, actor, {
      campanaId, modo: 'A_PIE', dispositivoId: await leerAjuste(db, 'dispositivo_id'), origen: 'SINTETICO', inicioMs: ini,
    });
    // Fases: caminata (0–99) · brigada detenida ~8 min con atenciones (100–159) · caminata (160–199) · pausa · caminata (205–239)
    const lecturas: Lectura[] = [];
    let { lat, lon } = ORIGEN;
    let rumbo = r() * Math.PI * 2;
    for (let k = 0; k < 240; k++) {
      const quieto = k >= 100 && k < 160;
      if (quieto) {
        // Jitter de ±2 m alrededor del punto de brigada (sin desplazamiento real).
        const j = 2 / 111_320;
        lecturas.push({ lat: lat + (r() - 0.5) * j, lon: lon + (r() - 0.5) * j, precision: entre(4, 12, 1), fechaMs: ini + k * 8000 });
        continue;
      }
      rumbo += (r() - 0.5) * 0.6;
      const paso = entre(6, 9); // metros cada 8 s (~1 m/s)
      lat += (paso * Math.cos(rumbo)) / 111_320;
      lon += (paso * Math.sin(rumbo)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      lecturas.push({ lat, lon, precision: entre(4, 15, 1), fechaMs: ini + k * 8000 });
    }
    const cfg = { ...CONFIG_GPS_DEFECTO };
    await rutas.registrarLecturas(db, ruta.id, lecturas.slice(0, 200), cfg);
    for (const k of [110, 128, 146]) await rutasRepo.evento(db, ruta.id, 'ATENCION', null, ini + k * 8000);
    await rutas.pausar(db, actor, ruta.id, ini + 200 * 8000);
    await rutas.reanudar(db, actor, ruta.id, ini + 205 * 8000);
    await rutas.registrarLecturas(db, ruta.id, lecturas.slice(205), cfg);
    await rutas.finalizar(db, actor, ruta.id, ini + 240 * 8000);
    rutaId = ruta.id;
  }
  await auditar(db, { usuarioId: actor.id, entidad: 'sistema', accion: 'DATOS_SINTETICOS', detalle: `${creados} pacientes` });
  return { pacientes: creados, rutaId };
}
