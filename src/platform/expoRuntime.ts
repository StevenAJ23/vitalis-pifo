import * as Crypto from 'expo-crypto';
import { configureRuntime } from './runtime';

/** Módulo de efecto: configura el runtime con generadores criptográficos nativos. */
configureRuntime({
  uuid: () => Crypto.randomUUID(),
  randomBytes: (n: number) => {
    // expo-crypto admite hasta 1024 bytes por llamada.
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const chunk = Math.min(1024, n - off);
      out.set(Crypto.getRandomBytes(chunk), off);
      off += chunk;
    }
    return out;
  },
  now: () => Date.now(),
});
