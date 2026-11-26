const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INVERSO: Record<string, number> = Object.fromEntries([...ALFABETO].map((c, i) => [c, i]));

export function aBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + ALFABETO[n & 63];
  }
  const resto = bytes.length - i;
  if (resto === 1) {
    const n = bytes[i] << 16;
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + '==';
  } else if (resto === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + '=';
  }
  return out;
}

export function desdeBase64(texto: string): Uint8Array {
  const limpio = texto.replace(/[\s=]/g, '');
  if (/[^A-Za-z0-9+/]/.test(limpio)) throw new Error('Base64 inválido');
  const out = new Uint8Array(Math.floor((limpio.length * 3) / 4));
  let buf = 0, bits = 0, j = 0;
  for (const c of limpio) {
    buf = (buf << 6) | INVERSO[c];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

export function aHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Codificación UTF-8 sin depender de TextEncoder (no garantizado en todos los motores JS). */
export function utf8(texto: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    let cp = texto.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < texto.length) {
      const lo = texto.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

export function desdeUtf8(bytes: Uint8Array): string {
  const partes: string[] = [];
  let cps: number[] = [];
  const flush = () => {
    partes.push(String.fromCodePoint(...cps));
    cps = [];
  };
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    let n: number;
    if (b < 0x80) { cp = b; n = 1; }
    else if ((b & 0xe0) === 0xc0) { cp = b & 0x1f; n = 2; }
    else if ((b & 0xf0) === 0xe0) { cp = b & 0x0f; n = 3; }
    else if ((b & 0xf8) === 0xf0) { cp = b & 0x07; n = 4; }
    else throw new Error('UTF-8 inválido');
    if (i + n > bytes.length) throw new Error('UTF-8 truncado');
    for (let k = 1; k < n; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) throw new Error('UTF-8 inválido');
      cp = (cp << 6) | (c & 0x3f);
    }
    cps.push(cp);
    if (cps.length >= 4096) flush();
    i += n;
  }
  flush();
  return partes.join('');
}

/** Comparación en tiempo constante. */
export function igualesTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
