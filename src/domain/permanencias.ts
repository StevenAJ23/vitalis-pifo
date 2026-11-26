import { distancia } from './geo';

/**
 * Detección automática de actividad del recorrido (sin que el usuario marque paradas):
 * - Permanencia: secuencia de puntos del mismo segmento dentro de `radioM` de su centro durante ≥ `minDuracionMs`.
 * - BRIGADA: permanencia durante la cual se guardaron atenciones (toma de signos). Basta ≥ `minBrigadaMs`.
 * - PARADA: permanencia sin atenciones (descanso, espera, traslado detenido…).
 * - El resto del tiempo activo es desplazamiento.
 * Las atenciones se usan solo como marcas de tiempo; no se vinculan pacientes con coordenadas.
 */
export interface PuntoTiempo {
  lat: number;
  lon: number;
  fechaMs: number;
  segmento: number;
}

export type TipoPermanencia = 'BRIGADA' | 'PARADA';

export interface Permanencia {
  inicioMs: number;
  finMs: number;
  duracionMs: number;
  lat: number;
  lon: number;
  puntos: number;
  atenciones: number;
  tipo: TipoPermanencia;
}

export interface ConfigPermanencia {
  radioM: number;
  minDuracionMs: number;
  minBrigadaMs: number;
  margenAtencionMs: number;
}

export const CONFIG_PERMANENCIA: ConfigPermanencia = {
  radioM: 40,
  minDuracionMs: 3 * 60_000,
  minBrigadaMs: 60_000,
  margenAtencionMs: 60_000,
};

function contarEn(atencionesMs: number[], ini: number, fin: number, margen: number): number {
  return atencionesMs.filter((t) => t >= ini - margen && t <= fin + margen).length;
}

export function detectarPermanencias(
  puntos: PuntoTiempo[],
  atencionesMs: number[],
  cfg: ConfigPermanencia = CONFIG_PERMANENCIA,
): Permanencia[] {
  const ps = [...puntos].sort((a, b) => a.fechaMs - b.fechaMs);
  const out: Permanencia[] = [];
  let i = 0;
  while (i < ps.length) {
    let lat = ps[i].lat;
    let lon = ps[i].lon;
    let n = 1;
    let j = i + 1;
    while (j < ps.length && ps[j].segmento === ps[i].segmento && distancia({ lat, lon }, ps[j]) <= cfg.radioM) {
      n++;
      lat += (ps[j].lat - lat) / n;
      lon += (ps[j].lon - lon) / n;
      j++;
    }
    const ini = ps[i].fechaMs;
    const fin = ps[j - 1].fechaMs;
    const dur = fin - ini;
    const atenciones = contarEn(atencionesMs, ini, fin, cfg.margenAtencionMs);
    const esBrigada = atenciones > 0 && dur >= cfg.minBrigadaMs;
    if (esBrigada || dur >= cfg.minDuracionMs) {
      out.push({ inicioMs: ini, finMs: fin, duracionMs: dur, lat, lon, puntos: n, atenciones, tipo: esBrigada ? 'BRIGADA' : 'PARADA' });
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

export interface ResumenActividad {
  brigadaMs: number;
  paradaMs: number;
  movimientoMs: number;
  puntosBrigada: number;
  paradas: number;
  atenciones: number;
}

export function resumirActividad(permanencias: Permanencia[], activoMs: number, atencionesTotales: number): ResumenActividad {
  const brigadaMs = permanencias.filter((p) => p.tipo === 'BRIGADA').reduce((a, p) => a + p.duracionMs, 0);
  const paradaMs = permanencias.filter((p) => p.tipo === 'PARADA').reduce((a, p) => a + p.duracionMs, 0);
  return {
    brigadaMs,
    paradaMs,
    movimientoMs: Math.max(0, activoMs - brigadaMs - paradaMs),
    puntosBrigada: permanencias.filter((p) => p.tipo === 'BRIGADA').length,
    paradas: permanencias.filter((p) => p.tipo === 'PARADA').length,
    atenciones: atencionesTotales,
  };
}

export type EstadoActividad = 'MOVIMIENTO' | 'DETENIDO' | 'BRIGADA' | 'SIN_DATOS';

/** Estado en vivo: analiza la "cola" de puntos cercanos a la última posición. */
export function estadoActual(
  puntos: PuntoTiempo[],
  atencionesMs: number[],
  ahoraMs: number,
  cfg: ConfigPermanencia = CONFIG_PERMANENCIA,
): EstadoActividad {
  if (puntos.length === 0) return 'SIN_DATOS';
  const ps = [...puntos].sort((a, b) => a.fechaMs - b.fechaMs);
  const ultimo = ps[ps.length - 1];
  let k = ps.length - 1;
  while (k > 0 && ps[k - 1].segmento === ultimo.segmento && distancia(ps[k - 1], ultimo) <= cfg.radioM) k--;
  const desde = ps[k].fechaMs;
  const hasta = Math.max(ultimo.fechaMs, ahoraMs);
  const dur = hasta - desde;
  if (contarEn(atencionesMs, desde, hasta, cfg.margenAtencionMs) > 0 && dur >= cfg.minBrigadaMs) return 'BRIGADA';
  if (dur >= 2 * 60_000) return 'DETENIDO';
  return 'MOVIMIENTO';
}
