import { coordenadaValida, distancia } from './geo';

export type ModoTraslado = 'A_PIE' | 'VEHICULO';

export interface ConfigGps {
  intervaloMs: number; // intervalo de muestreo solicitado al SO
  distanciaM: number; // distancia mínima solicitada al SO
  precisionMaxM: number; // descartar lecturas con precisión peor que esto
  modo: ModoTraslado;
  pausaSenalMaxS: number; // una pérdida de señal mayor abre un nuevo segmento
}

export const CONFIG_GPS_DEFECTO: ConfigGps = {
  intervaloMs: 5000,
  distanciaM: 5,
  precisionMaxM: 30,
  modo: 'A_PIE',
  pausaSenalMaxS: 120,
};

/** Velocidad máxima compatible con el modo de traslado (m/s). */
export const VELOCIDAD_MAX: Record<ModoTraslado, number> = {
  A_PIE: 4, // ~14 km/h: caminata rápida/trote
  VEHICULO: 40, // ~144 km/h
};

/** Saltos consecutivos coherentes tras los cuales se asume reposicionamiento real. */
export const SALTOS_PARA_REPOSICIONAR = 3;

export interface Lectura {
  lat: number;
  lon: number;
  precision: number | null | undefined;
  fechaMs: number;
}

export interface PuntoAceptado {
  lat: number;
  lon: number;
  precision: number | null;
  fechaMs: number;
  segmento: number;
}

export type MotivoRechazo = 'invalida' | 'precision' | 'repetida' | 'salto' | 'fuera_de_tramo' | 'antigua';

export type Decision =
  | { tipo: 'aceptar'; segmento: number; distanciaSumada: number; nuevoSegmento: boolean; motivoSegmento?: 'senal' | 'reposicion' }
  | { tipo: 'rechazar'; motivo: MotivoRechazo };

export interface EstadoFiltro {
  segmentoActual: number;
  tramoInicioMs: number;
  ultimo: PuntoAceptado | null; // último punto aceptado de la ruta
  saltosConsecutivos: number;
}

/**
 * Decide si una lectura se acepta y cuánta distancia aporta.
 * Reglas (especificación §05): descartar coordenadas inválidas, repetidas, con precisión desconocida o peor que el
 * umbral; detectar saltos incompatibles con el modo; sumar solo dentro del mismo segmento; no unir pausas ni pérdidas
 * largas de señal (se abre un nuevo segmento sin sumar distancia).
 */
export function evaluarLectura(l: Lectura, est: EstadoFiltro, cfg: ConfigGps): Decision {
  if (!coordenadaValida(l.lat, l.lon) || !Number.isFinite(l.fechaMs)) return { tipo: 'rechazar', motivo: 'invalida' };
  if (l.precision == null || !Number.isFinite(l.precision) || l.precision < 0 || l.precision > cfg.precisionMaxM) {
    return { tipo: 'rechazar', motivo: 'precision' };
  }
  if (l.fechaMs < est.tramoInicioMs) return { tipo: 'rechazar', motivo: 'fuera_de_tramo' };

  const prev = est.ultimo;
  // Punto previo de otro segmento (pausa/reanudación): inicia el segmento actual sin sumar distancia.
  if (!prev || prev.segmento !== est.segmentoActual) {
    return { tipo: 'aceptar', segmento: est.segmentoActual, distanciaSumada: 0, nuevoSegmento: false };
  }
  if (l.fechaMs <= prev.fechaMs) return { tipo: 'rechazar', motivo: 'antigua' };

  const d = distancia(prev, l);
  const dt = (l.fechaMs - prev.fechaMs) / 1000;

  if (dt > cfg.pausaSenalMaxS) {
    return { tipo: 'aceptar', segmento: est.segmentoActual + 1, distanciaSumada: 0, nuevoSegmento: true, motivoSegmento: 'senal' };
  }

  // Movimiento menor que el ruido esperado: lectura repetida (evita acumular "deriva" estando quieto).
  // Cada `latido` se acepta igualmente un punto de permanencia SIN sumar distancia: así una detención larga
  // (p. ej. la brigada tomando signos) no se confunde con una pérdida de señal y puede detectarse.
  const umbralRuido = Math.max(cfg.distanciaM, 0.5 * Math.max(l.precision, prev.precision ?? 0));
  if (d < umbralRuido) {
    const latido = Math.min(60_000, cfg.pausaSenalMaxS * 500);
    if (l.fechaMs - prev.fechaMs >= latido) {
      return { tipo: 'aceptar', segmento: est.segmentoActual, distanciaSumada: 0, nuevoSegmento: false };
    }
    return { tipo: 'rechazar', motivo: 'repetida' };
  }

  if (d / Math.max(dt, 1) > VELOCIDAD_MAX[cfg.modo]) {
    if (est.saltosConsecutivos + 1 >= SALTOS_PARA_REPOSICIONAR) {
      // Varias lecturas consecutivas lejos del último punto: el último punto era el anómalo o hubo traslado no
      // registrado. Se abre un segmento nuevo sin sumar el tramo dudoso.
      return { tipo: 'aceptar', segmento: est.segmentoActual + 1, distanciaSumada: 0, nuevoSegmento: true, motivoSegmento: 'reposicion' };
    }
    return { tipo: 'rechazar', motivo: 'salto' };
  }

  return { tipo: 'aceptar', segmento: est.segmentoActual, distanciaSumada: d, nuevoSegmento: false };
}
