import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '../platform/runtime';
import { aBase64, desdeBase64, igualesTiempoConstante, utf8 } from './encoding';

/**
 * Credenciales protegidas con PBKDF2-HMAC-SHA256 + sal aleatoria de 16 bytes.
 * Las iteraciones se guardan junto al hash: si cambia la política, la credencial se recalcula de forma
 * transparente en el siguiente inicio de sesión exitoso (ver authService.iniciarSesion).
 * Se usa una implementación JS auditada (@noble/hashes) porque expo-crypto no expone KDFs. 20 000 iteraciones
 * mantienen el ingreso por debajo de ~0,5 s en teléfonos de gama media (Hermes); el riesgo de fuerza bruta se
 * mitiga con el bloqueo progresivo por intentos fallidos y porque los hashes residen dentro de la base cifrada
 * con SQLCipher (clave en el Keystore del dispositivo).
 */
export const ITERACIONES_CREDENCIAL = 20_000;
const PREFIJO = 'pbkdf2-sha256';

/** Iteraciones con las que se protegió una credencial (para recalcularla si cambió la política). */
export function iteracionesDe(protegida: string | null | undefined): number | null {
  const p = protegida?.split('$');
  return p && p.length === 4 ? Number(p[1]) || null : null;
}

export async function protegerCredencial(clave: string, iteraciones = ITERACIONES_CREDENCIAL): Promise<string> {
  const sal = randomBytes(16);
  const hash = await pbkdf2Async(sha256, utf8(clave), sal, { c: iteraciones, dkLen: 32, asyncTick: 20 });
  return `${PREFIJO}$${iteraciones}$${aBase64(sal)}$${aBase64(hash)}`;
}

export async function verificarCredencial(clave: string, protegida: string | null | undefined): Promise<boolean> {
  if (!protegida) return false;
  const partes = protegida.split('$');
  if (partes.length !== 4 || partes[0] !== PREFIJO) return false;
  const iter = Number(partes[1]);
  if (!Number.isInteger(iter) || iter < 1000 || iter > 5_000_000) return false;
  const sal = desdeBase64(partes[2]);
  const esperado = desdeBase64(partes[3]);
  const hash = await pbkdf2Async(sha256, utf8(clave), sal, { c: iter, dkLen: esperado.length, asyncTick: 20 });
  return igualesTiempoConstante(hash, esperado);
}

/** Política: mínimo 8 caracteres, al menos una letra y un número. */
export function validarPoliticaClave(clave: string): string | null {
  if (clave.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (clave.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) return 'La contraseña debe combinar letras y números.';
  return null;
}
