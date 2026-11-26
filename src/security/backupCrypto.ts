import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '../platform/runtime';
import { aBase64, desdeBase64, desdeUtf8, utf8 } from './encoding';

export const FORMATO_RESPALDO = 'vitalis-pifo-respaldo';
export const VERSION_SOBRE = 1;
export const ITERACIONES_RESPALDO = 150_000;

export interface SobreCifrado {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  creado: number;
  dispositivo: string;
  esquema: number;
  kdf: { alg: 'PBKDF2-SHA256'; iter: number; sal: string };
  cifrado: { alg: 'AES-256-GCM'; nonce: string };
  datos: string;
}

export class ClaveRespaldoIncorrectaError extends Error {
  constructor() {
    super('No se pudo descifrar: contraseña incorrecta o archivo alterado.');
    this.name = 'ClaveRespaldoIncorrectaError';
  }
}

/** Datos autenticados: la cabecera del sobre no puede alterarse sin invalidar el descifrado. */
function aad(s: Pick<SobreCifrado, 'formato' | 'version' | 'creado' | 'dispositivo' | 'esquema'>): Uint8Array {
  return utf8(`${s.formato}|${s.version}|${s.creado}|${s.dispositivo}|${s.esquema}`);
}

async function derivar(frase: string, sal: Uint8Array, iter: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8(frase), sal, { c: iter, dkLen: 32, asyncTick: 20 });
}

export function validarFraseRespaldo(frase: string): string | null {
  if (frase.length < 12) return 'La clave de respaldo debe tener al menos 12 caracteres.';
  if (!/[A-Za-z]/.test(frase) || !/\d/.test(frase)) return 'Combine letras y números en la clave de respaldo.';
  return null;
}

export async function cifrarRespaldo(
  contenido: string,
  frase: string,
  meta: { creado: number; dispositivo: string; esquema: number },
  iter = ITERACIONES_RESPALDO,
): Promise<SobreCifrado> {
  const sal = randomBytes(16);
  const nonce = randomBytes(12);
  const clave = await derivar(frase, sal, iter);
  const cabecera = { formato: FORMATO_RESPALDO, version: VERSION_SOBRE, ...meta } as const;
  const cifrado = gcm(clave, nonce, aad(cabecera)).encrypt(utf8(contenido));
  clave.fill(0);
  return {
    ...cabecera,
    kdf: { alg: 'PBKDF2-SHA256', iter, sal: aBase64(sal) },
    cifrado: { alg: 'AES-256-GCM', nonce: aBase64(nonce) },
    datos: aBase64(cifrado),
  };
}

export function parsearSobre(texto: string): SobreCifrado {
  let obj: unknown;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un respaldo de Vitalis Pifo.');
  }
  const s = obj as Partial<SobreCifrado>;
  if (
    !s || s.formato !== FORMATO_RESPALDO || typeof s.version !== 'number' || s.version > VERSION_SOBRE ||
    !s.kdf || s.kdf.alg !== 'PBKDF2-SHA256' || !s.cifrado || s.cifrado.alg !== 'AES-256-GCM' ||
    typeof s.datos !== 'string' || typeof s.creado !== 'number' || typeof s.esquema !== 'number' ||
    typeof s.dispositivo !== 'string'
  ) {
    throw new Error('El archivo no es un respaldo de Vitalis Pifo válido o su versión no es compatible.');
  }
  if (!Number.isInteger(s.kdf.iter) || s.kdf.iter < 10_000 || s.kdf.iter > 5_000_000) {
    throw new Error('Parámetros de cifrado del respaldo no admitidos.');
  }
  return s as SobreCifrado;
}

export async function descifrarRespaldo(sobre: SobreCifrado, frase: string): Promise<string> {
  const clave = await derivar(frase, desdeBase64(sobre.kdf.sal), sobre.kdf.iter);
  try {
    const plano = gcm(clave, desdeBase64(sobre.cifrado.nonce), aad(sobre)).decrypt(desdeBase64(sobre.datos));
    return desdeUtf8(plano);
  } catch {
    throw new ClaveRespaldoIncorrectaError();
  } finally {
    clave.fill(0);
  }
}
