/** Normaliza texto para búsqueda: minúsculas, sin tildes, espacios simples. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Capitaliza nombres propios ("maría  josé" → "María José"). */
export function capitalizarNombre(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((p) => (p ? p.charAt(0).toLocaleUpperCase('es') + p.slice(1).toLocaleLowerCase('es') : p))
    .join(' ');
}

/** Escapa comodines de LIKE para consultas parametrizadas con ESCAPE '\'. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Validación de cédula ecuatoriana (módulo 10, provincias 01-24 y 30). */
export function cedulaValida(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;
  const provincia = Number(cedula.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return false;
  const tercero = Number(cedula[2]);
  if (tercero >= 6) return false;
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(cedula[i]) * coef[i];
    if (v >= 10) v -= 9;
    suma += v;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(cedula[9]);
}

/** Celular ecuatoriano: 09XXXXXXXX. */
export function celularValido(tel: string): boolean {
  return /^09\d{8}$/.test(tel);
}

/** Enmascara un teléfono para listados (0991234567 → 099•••4567). */
export function enmascararTelefono(tel: string | null | undefined): string {
  if (!tel) return '—';
  if (tel.length < 7) return '•••';
  return `${tel.slice(0, 3)}•••${tel.slice(-4)}`;
}

const PALABRAS_VACIAS = new Set(['la', 'el', 'los', 'las', 'de', 'del', 'san', 'santa', 'barrio', 'sector', 'comunidad', 'y']);

/** Código de zona para el identificador del paciente (P-ZONA-NNNN): 4 letras de la palabra principal del sector. */
export function codigoZona(sector: string): string {
  const palabras = normalizar(sector).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const principal = palabras.find((p) => !PALABRAS_VACIAS.has(p) && p.length >= 2) ?? palabras[0] ?? 'zona';
  return principal.slice(0, 4).toUpperCase().padEnd(4, 'X');
}
