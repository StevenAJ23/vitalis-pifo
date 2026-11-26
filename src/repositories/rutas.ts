import type { Db } from '../db/types';
import type { EstadoRuta, Ruta, RutaEvento, RutaParada, RutaPunto } from '../domain/types';
import { now, uuid } from '../platform/runtime';

export function porId(db: Db, id: string) {
  return db.get<Ruta>('SELECT * FROM rutas WHERE id = ?', [id]);
}

/** Ruta abierta del dispositivo (no finalizada). Solo puede existir una. */
export function abierta(db: Db) {
  return db.get<Ruta>("SELECT * FROM rutas WHERE estado <> 'FINALIZADA' ORDER BY inicio_ms DESC LIMIT 1");
}

export interface RutaResumen extends Ruta {
  campana_nombre: string;
  usuario_nombre: string | null;
  n_puntos: number;
  n_paradas: number;
  n_segmentos: number;
}

export function listar(db: Db, campanaId?: string | null) {
  return db.all<RutaResumen>(
    `SELECT r.*, c.nombre AS campana_nombre, u.nombre AS usuario_nombre,
       (SELECT COUNT(*) FROM ruta_puntos rp WHERE rp.ruta_id = r.id) AS n_puntos,
       (SELECT COUNT(*) FROM ruta_paradas pa WHERE pa.ruta_id = r.id) AS n_paradas,
       (SELECT COUNT(DISTINCT segmento) FROM ruta_puntos rp WHERE rp.ruta_id = r.id) AS n_segmentos
     FROM rutas r JOIN campanas c ON c.id = r.campana_id LEFT JOIN usuarios u ON u.id = r.usuario_id
     ${campanaId ? 'WHERE r.campana_id = ?' : ''} ORDER BY r.inicio_ms DESC`,
    campanaId ? [campanaId] : [],
  );
}

export function puntos(db: Db, rutaId: string) {
  return db.all<RutaPunto>('SELECT * FROM ruta_puntos WHERE ruta_id = ? ORDER BY fecha_ms', [rutaId]);
}

export function ultimoPunto(db: Db, rutaId: string) {
  return db.get<RutaPunto>('SELECT * FROM ruta_puntos WHERE ruta_id = ? ORDER BY fecha_ms DESC LIMIT 1', [rutaId]);
}

export function paradas(db: Db, rutaId: string) {
  return db.all<RutaParada>('SELECT * FROM ruta_paradas WHERE ruta_id = ? ORDER BY fecha_ms', [rutaId]);
}

export function eventos(db: Db, rutaId: string) {
  return db.all<RutaEvento>('SELECT * FROM ruta_eventos WHERE ruta_id = ? ORDER BY fecha_ms', [rutaId]);
}

export async function evento(db: Db, rutaId: string, tipo: string, detalle?: string | null, fechaMs?: number) {
  await db.run('INSERT INTO ruta_eventos (id, ruta_id, tipo, fecha_ms, detalle) VALUES (?,?,?,?,?)', [
    uuid(), rutaId, tipo, fechaMs ?? now(), detalle ?? null,
  ]);
}

export async function insertar(db: Db, r: Ruta) {
  await db.run(
    `INSERT INTO rutas (id, campana_id, usuario_id, dispositivo_id, estado, inicio_ms, fin_ms, activo_ms, distancia_m,
       segmento_actual, tramo_inicio_ms, saltos_consecutivos, modo_traslado, origen, ultimo_punto_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      r.id, r.campana_id, r.usuario_id, r.dispositivo_id, r.estado, r.inicio_ms, r.fin_ms, r.activo_ms, r.distancia_m,
      r.segmento_actual, r.tramo_inicio_ms, r.saltos_consecutivos, r.modo_traslado, r.origen, r.ultimo_punto_ms,
    ],
  );
}

export async function actualizarEstado(
  db: Db,
  id: string,
  c: { estado: EstadoRuta; activo_ms: number; segmento_actual: number; tramo_inicio_ms: number | null; fin_ms?: number | null; saltos_consecutivos?: number },
) {
  await db.run(
    `UPDATE rutas SET estado=?, activo_ms=?, segmento_actual=?, tramo_inicio_ms=?, fin_ms=COALESCE(?, fin_ms),
       saltos_consecutivos=COALESCE(?, saltos_consecutivos) WHERE id=?`,
    [c.estado, c.activo_ms, c.segmento_actual, c.tramo_inicio_ms, c.fin_ms ?? null, c.saltos_consecutivos ?? null, id],
  );
}

export async function insertarPunto(db: Db, p: RutaPunto): Promise<boolean> {
  const r = await db.run(
    'INSERT OR IGNORE INTO ruta_puntos (id, ruta_id, segmento, fecha_ms, lat, lon, precision_m) VALUES (?,?,?,?,?,?,?)',
    [p.id, p.ruta_id, p.segmento, p.fecha_ms, p.lat, p.lon, p.precision_m],
  );
  return r.changes > 0;
}

export async function acumular(
  db: Db,
  id: string,
  c: { distanciaSumada: number; segmento: number; saltos: number; ultimoPuntoMs: number | null },
) {
  await db.run(
    `UPDATE rutas SET distancia_m = distancia_m + ?, segmento_actual = ?, saltos_consecutivos = ?,
       ultimo_punto_ms = COALESCE(?, ultimo_punto_ms) WHERE id = ?`,
    [c.distanciaSumada, c.segmento, c.saltos, c.ultimoPuntoMs, id],
  );
}

export async function insertarParada(db: Db, p: RutaParada) {
  await db.run('INSERT INTO ruta_paradas (id, ruta_id, fecha_ms, etiqueta, lat, lon) VALUES (?,?,?,?,?,?)', [
    p.id, p.ruta_id, p.fecha_ms, p.etiqueta, p.lat, p.lon,
  ]);
}

export async function eliminarParada(db: Db, id: string) {
  await db.run('DELETE FROM ruta_paradas WHERE id = ?', [id]);
}

/** Depuración por plazo de conservación: elimina rutas finalizadas anteriores a `antesDeMs`. */
export async function depurarAntesDe(db: Db, antesDeMs: number): Promise<number> {
  const ids = await db.all<{ id: string }>("SELECT id FROM rutas WHERE estado = 'FINALIZADA' AND fin_ms < ?", [antesDeMs]);
  for (const { id } of ids) {
    await db.run('DELETE FROM ruta_puntos WHERE ruta_id = ?', [id]);
    await db.run('DELETE FROM ruta_paradas WHERE ruta_id = ?', [id]);
    await db.run('DELETE FROM ruta_eventos WHERE ruta_id = ?', [id]);
    await db.run('DELETE FROM rutas WHERE id = ?', [id]);
  }
  return ids.length;
}
