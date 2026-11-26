export function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

export function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return (parte / total) * 100;
}

export function formatearNumero(v: number | null | undefined, decimales = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(decimales).replace('.', ',');
}

export function formatearDuracion(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Distancia estimada (nunca exacta): "≈ 850 m" o "≈ 1,24 km". */
export function formatearDistancia(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `≈ ${Math.round(m)} m`;
  return `≈ ${(m / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatearSegundos(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—';
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  return formatearDuracion(s * 1000);
}
