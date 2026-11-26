import type { LocationObject } from 'expo-location';
import { obtenerDb } from '../db/expoDb';
import type { Lectura, MotivoRechazo } from '../domain/gpsFilter';
import type { Ruta } from '../domain/types';
import { leerConfigGps } from '../repositories/ajustes';
import * as rutasRepo from '../repositories/rutas';
import { crearStore } from '../state/store';
import { registrarLecturas } from './rutaService';

export const TAREA_GPS = 'vitalis-pifo-recorrido-gps';

export type ModoCaptura = 'SEGUNDO_PLANO' | 'PRIMER_PLANO' | null;
export type EstadoSenal = 'BUSCANDO' | 'OK' | 'DEBIL' | 'SIN_SENAL';

export interface EstadoGps {
  ruta: Ruta | null;
  modoCaptura: ModoCaptura;
  permisoPrimerPlano: 'concedido' | 'denegado' | 'sin_consultar';
  permisoSegundoPlano: 'concedido' | 'denegado' | 'sin_consultar';
  serviciosActivos: boolean | null;
  senal: EstadoSenal;
  ultimaLectura: { lat: number; lon: number; precision: number | null; fechaMs: number } | null;
  ultimaAceptadaMs: number | null;
  aceptados: number;
  rechazados: Partial<Record<MotivoRechazo | 'ruta_inactiva', number>>;
  puntosVersion: number;
  error: string | null;
}

export const gpsStore = crearStore<EstadoGps>({
  ruta: null,
  modoCaptura: null,
  permisoPrimerPlano: 'sin_consultar',
  permisoSegundoPlano: 'sin_consultar',
  serviciosActivos: null,
  senal: 'BUSCANDO',
  ultimaLectura: null,
  ultimaAceptadaMs: null,
  aceptados: 0,
  rechazados: {},
  puntosVersion: 0,
  error: null,
});

export function aLecturas(locs: LocationObject[]): Lectura[] {
  return locs.map((l) => ({
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    precision: l.coords.accuracy ?? null,
    fechaMs: l.timestamp,
  }));
}

let cola: Promise<unknown> = Promise.resolve();

/**
 * Ingesta serializada: cada lote se persiste en una transacción antes de procesar el siguiente.
 * Usada por la suscripción de primer plano y por la tarea de segundo plano (que puede ejecutarse sin interfaz).
 */
export function ingerir(locs: LocationObject[]): Promise<void> {
  const tarea = cola.then(async () => {
    if (locs.length === 0) return;
    const db = await obtenerDb();
    const ruta = gpsStore.get().ruta ?? (await rutasRepo.abierta(db));
    if (!ruta || ruta.estado !== 'EN_CURSO') return;
    const lecturas = aLecturas(locs);
    const ultima = lecturas[lecturas.length - 1];
    const cfg = await leerConfigGps(db);
    const res = await registrarLecturas(db, ruta.id, lecturas, cfg);
    const actual = gpsStore.get();
    const rech = { ...actual.rechazados };
    for (const [k, v] of Object.entries(res.rechazados)) rech[k as MotivoRechazo] = (rech[k as MotivoRechazo] ?? 0) + (v ?? 0);
    const rutaAct = await rutasRepo.porId(db, ruta.id);
    gpsStore.set({
      ruta: rutaAct ?? actual.ruta,
      ultimaLectura: { ...ultima, precision: ultima.precision ?? null },
      ultimaAceptadaMs: res.ultimo?.fechaMs ?? actual.ultimaAceptadaMs,
      aceptados: actual.aceptados + res.aceptados,
      rechazados: rech,
      puntosVersion: res.aceptados > 0 ? actual.puntosVersion + 1 : actual.puntosVersion,
      senal: ultima.precision != null && ultima.precision <= cfg.precisionMaxM ? 'OK' : 'DEBIL',
      error: null,
    });
  });
  cola = tarea.catch((e: unknown) => {
    gpsStore.set({ error: e instanceof Error ? e.message : 'Error al guardar la posición' });
  });
  return cola.then(() => undefined);
}

/** Espera a que se hayan escrito todas las lecturas pendientes (al pausar/finalizar). */
export function vaciarCola(): Promise<void> {
  return cola.then(() => undefined);
}

export async function registrarErrorTarea(mensaje: string): Promise<void> {
  gpsStore.set({ error: mensaje });
  try {
    const db = await obtenerDb();
    const r = await rutasRepo.abierta(db);
    if (r) await rutasRepo.evento(db, r.id, 'ERROR_GPS', mensaje.slice(0, 200));
  } catch {
    // sin base disponible no hay dónde registrar; el estado en memoria ya refleja el error
  }
}
