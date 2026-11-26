export interface Punto {
  lat: number;
  lon: number;
}

const R_TIERRA = 6371000;

/** Distancia Haversine en metros. */
export function distancia(a: Punto, b: Punto): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0) // "Null Island": típico valor por defecto de un fix inválido
  );
}

/** Longitud total de una polilínea. */
export function longitud(puntos: Punto[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += distancia(puntos[i - 1], puntos[i]);
  return total;
}

export interface Caja {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function cajaDe(puntos: Punto[]): Caja | null {
  if (puntos.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of puntos) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

/* ---------- Proyección Web Mercator (compatible con teselas XYZ) ---------- */

export const TAM_TESELA = 256;

export function aMundo(p: Punto, zoom: number): { x: number; y: number } {
  const escala = TAM_TESELA * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lon + 180) / 360) * escala,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * escala,
  };
}

export function desdeMundo(x: number, y: number, zoom: number): Punto {
  const escala = TAM_TESELA * 2 ** zoom;
  const lon = (x / escala) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / escala;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/** Metros por píxel en una latitud y zoom dados. */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Mayor zoom entero en que la caja cabe en el lienzo con margen. */
export function zoomParaCaja(caja: Caja, ancho: number, alto: number, margen = 32, maxZoom = 18): number {
  for (let z = maxZoom; z >= 2; z--) {
    const a = aMundo({ lat: caja.maxLat, lon: caja.minLon }, z);
    const b = aMundo({ lat: caja.minLat, lon: caja.maxLon }, z);
    if (b.x - a.x <= ancho - 2 * margen && b.y - a.y <= alto - 2 * margen) return z;
  }
  return 2;
}

/** Longitud "redonda" para barra de escala. */
export function escalaRedonda(metrosMax: number): number {
  const opciones = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  let elegido = opciones[0];
  for (const o of opciones) if (o <= metrosMax) elegido = o;
  return elegido;
}

/** Generaliza coordenadas a una cuadrícula (~111 m con 3 decimales) para informes académicos. */
export function generalizar(p: Punto, decimales = 3): Punto {
  const f = 10 ** decimales;
  return { lat: Math.round(p.lat * f) / f, lon: Math.round(p.lon * f) / f };
}
