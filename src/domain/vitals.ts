/**
 * Rangos de validación de signos vitales.
 * - `min/max`: límites de plausibilidad física (fuera de ellos el valor se rechaza como error de digitación/unidad).
 * - `atipicoBajo/atipicoAlto`: valores plausibles pero poco frecuentes que se marcan para revisión por personal
 *   médico. No constituyen diagnóstico automático.
 */
export type CampoVital = 'sistolica' | 'diastolica' | 'frecuencia' | 'temperatura' | 'spo2' | 'peso' | 'talla_cm';

export interface RangoVital {
  etiqueta: string;
  unidad: string;
  min: number;
  max: number;
  entero: boolean;
  atipicoBajo: number;
  atipicoAlto: number;
  pista: string;
}

export const RANGOS: Record<CampoVital, RangoVital> = {
  sistolica: { etiqueta: 'Presión sistólica', unidad: 'mmHg', min: 50, max: 260, entero: true, atipicoBajo: 90, atipicoAlto: 160, pista: 'Ej. 120' },
  diastolica: { etiqueta: 'Presión diastólica', unidad: 'mmHg', min: 30, max: 160, entero: true, atipicoBajo: 50, atipicoAlto: 100, pista: 'Ej. 80' },
  frecuencia: { etiqueta: 'Frecuencia cardíaca', unidad: 'lpm', min: 20, max: 250, entero: true, atipicoBajo: 50, atipicoAlto: 120, pista: 'Ej. 72' },
  temperatura: { etiqueta: 'Temperatura', unidad: '°C', min: 30, max: 45, entero: false, atipicoBajo: 35, atipicoAlto: 38, pista: 'Ej. 36,5' },
  // Pifo está a ~2 600 m s. n. m.: una SpO₂ de 90–92 % es frecuente en personas sanas; se marca por debajo de 90 %.
  spo2: { etiqueta: 'Saturación O₂', unidad: '%', min: 50, max: 100, entero: true, atipicoBajo: 90, atipicoAlto: 101, pista: 'Ej. 93' },
  peso: { etiqueta: 'Peso', unidad: 'kg', min: 1, max: 350, entero: false, atipicoBajo: 3, atipicoAlto: 200, pista: 'Ej. 70,5' },
  talla_cm: { etiqueta: 'Talla', unidad: 'cm', min: 40, max: 230, entero: false, atipicoBajo: 50, atipicoAlto: 210, pista: 'Ej. 165' },
};

export const CAMPOS_VITALES = Object.keys(RANGOS) as CampoVital[];

export type Mediciones = Partial<Record<CampoVital, number | null>>;

/** Rango de IMC fuera del cual se pide revisar unidades (p. ej. talla en metros). */
export const IMC_ATIPICO = { bajo: 12, alto: 60 };

export interface Atipico {
  campo: CampoVital | 'imc' | 'presion';
  mensaje: string;
}

export function detectarAtipicos(m: Mediciones, imc: number | null): Atipico[] {
  const out: Atipico[] = [];
  for (const campo of CAMPOS_VITALES) {
    const v = m[campo];
    if (v == null) continue;
    const r = RANGOS[campo];
    if (v < r.atipicoBajo || v > r.atipicoAlto) {
      out.push({ campo, mensaje: `${r.etiqueta} ${String(v).replace('.', ',')} ${r.unidad} fuera del rango habitual` });
    }
  }
  if (m.sistolica != null && m.diastolica != null && m.sistolica - m.diastolica < 15) {
    out.push({ campo: 'presion', mensaje: 'Diferencia sistólica-diastólica inusualmente baja' });
  }
  if (imc != null && (imc < IMC_ATIPICO.bajo || imc > IMC_ATIPICO.alto)) {
    out.push({ campo: 'imc', mensaje: `IMC ${imc.toFixed(2).replace('.', ',')} improbable: revise unidades de peso (kg) y talla (cm)` });
  }
  return out;
}

/** Cuenta las mediciones numéricas no registradas (campos faltantes). */
export function contarFaltantes(m: Mediciones): number {
  return CAMPOS_VITALES.filter((c) => m[c] == null).length;
}

/** Convierte texto con coma o punto decimal en número; vacío → null; inválido → NaN. */
export function parsearNumero(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  const t = String(texto).trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}
