/**
 * Dependencias de plataforma inyectables (aleatoriedad criptográfica, UUID, reloj).
 * La app las configura con expo-crypto (src/platform/expoRuntime.ts) y las pruebas con node:crypto.
 * Así el dominio y los servicios no dependen de módulos nativos (principio de inversión de dependencias).
 */
export interface Runtime {
  uuid(): string;
  randomBytes(n: number): Uint8Array;
  now(): number;
}

let current: Runtime | null = null;

export function configureRuntime(rt: Runtime): void {
  current = rt;
}

export function runtime(): Runtime {
  if (!current) throw new Error('Runtime de plataforma no configurado');
  return current;
}

export const uuid = (): string => runtime().uuid();
export const now = (): number => runtime().now();
export const randomBytes = (n: number): Uint8Array => runtime().randomBytes(n);
