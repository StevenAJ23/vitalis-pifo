/**
 * IMC = peso / (talla_cm / 100)². Si falta peso o talla, el IMC es nulo.
 * Nunca se sustituyen mediciones ausentes por cero.
 */
export function calcularImc(pesoKg: number | null | undefined, tallaCm: number | null | undefined): number | null {
  if (pesoKg == null || tallaCm == null) return null;
  if (!Number.isFinite(pesoKg) || !Number.isFinite(tallaCm)) return null;
  if (pesoKg <= 0 || tallaCm <= 0) return null;
  const m = tallaCm / 100;
  return Math.round((pesoKg / (m * m)) * 100) / 100;
}

/** Formato con dos decimales y coma decimal (es-EC). */
export function formatearImc(imc: number | null | undefined): string {
  if (imc == null) return '—';
  return imc.toFixed(2).replace('.', ',');
}
