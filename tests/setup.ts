import { randomBytes, randomUUID } from 'node:crypto';
import { configureRuntime } from '../src/platform/runtime';

let reloj: number | null = null;

/** Permite fijar el reloj en pruebas deterministas. */
export function fijarReloj(ms: number | null) {
  reloj = ms;
}

configureRuntime({
  uuid: () => randomUUID(),
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  now: () => reloj ?? Date.now(),
});
