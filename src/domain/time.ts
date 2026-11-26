const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local YYYY-MM-DD. */
export function fechaISO(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fechaHora(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hora(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Valida 'YYYY-MM-DD' como fecha real. */
export function esFechaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Valida 'YYYY-MM-DD HH:mm'. */
export function esFechaHoraValida(texto: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(texto);
  if (!m) return false;
  return esFechaValida(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60;
}

/** Edad cumplida a partir de fecha de nacimiento ISO. */
export function edadDesde(isoNacimiento: string, referenciaMs: number): number | null {
  if (!esFechaValida(isoNacimiento)) return null;
  const [y, m, d] = isoNacimiento.split('-').map(Number);
  const ref = new Date(referenciaMs);
  let edad = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) edad--;
  return edad >= 0 ? edad : null;
}

export function inicioDelDia(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function finDelDia(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
