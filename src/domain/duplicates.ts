import { normalizar } from './text';

export interface DatosComparables {
  id?: string;
  nombres: string;
  apellidos: string;
  edad: number | null;
  sector: string;
  telefono: string | null;
  cedula?: string | null;
}

export interface PosibleDuplicado<T extends DatosComparables> {
  paciente: T;
  puntaje: number;
  motivos: string[];
}

/** Distancia de Levenshtein acotada (para tolerar errores de tipeo en nombres). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const tol = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return levenshtein(a, b) <= tol;
}

/**
 * Puntúa candidatos a duplicado. No fusiona: solo advierte (especificación §02).
 * Umbral: puntaje ≥ 3 se considera posible duplicado.
 */
export function evaluarDuplicados<T extends DatosComparables>(nuevo: DatosComparables, candidatos: T[]): PosibleDuplicado<T>[] {
  const nn = normalizar(nuevo.nombres);
  const na = normalizar(nuevo.apellidos);
  const out: PosibleDuplicado<T>[] = [];
  for (const c of candidatos) {
    if (nuevo.id && c.id === nuevo.id) continue;
    const motivos: string[] = [];
    let puntaje = 0;
    if (nuevo.cedula && c.cedula && nuevo.cedula === c.cedula) {
      puntaje += 10;
      motivos.push('Misma cédula');
    }
    if (nuevo.telefono && c.telefono && nuevo.telefono === c.telefono) {
      puntaje += 3;
      motivos.push('Mismo celular');
    }
    const cn = normalizar(c.nombres);
    const ca = normalizar(c.apellidos);
    const apellidosIguales = similar(na, ca);
    const nombresIguales = similar(nn, cn) || (nn.split(' ')[0] === cn.split(' ')[0] && nn.length > 0);
    if (apellidosIguales && nombresIguales) {
      puntaje += 3;
      motivos.push('Nombre y apellidos similares');
    } else if (apellidosIguales) {
      puntaje += 1;
      motivos.push('Apellidos similares');
    }
    if (nuevo.edad != null && c.edad != null && Math.abs(nuevo.edad - c.edad) <= 1) {
      puntaje += 1;
      motivos.push('Edad similar');
    }
    if (normalizar(nuevo.sector) && normalizar(nuevo.sector) === normalizar(c.sector)) {
      puntaje += 1;
      motivos.push('Mismo sector');
    }
    if (puntaje >= 3) out.push({ paciente: c, puntaje, motivos });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje);
}
