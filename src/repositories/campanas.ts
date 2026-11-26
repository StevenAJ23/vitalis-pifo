import type { Db } from '../db/types';
import type { Campana, EstadoCampana } from '../domain/types';

export function porId(db: Db, id: string) {
  return db.get<Campana>('SELECT * FROM campanas WHERE id = ?', [id]);
}

export function listar(db: Db, incluirArchivadas = false) {
  return db.all<Campana>(
    `SELECT * FROM campanas ${incluirArchivadas ? '' : "WHERE estado <> 'ARCHIVADA'"}
     ORDER BY CASE estado WHEN 'ACTIVA' THEN 0 WHEN 'PLANIFICADA' THEN 1 WHEN 'CERRADA' THEN 2 ELSE 3 END, inicio DESC`,
  );
}

export interface DatosCampana {
  nombre: string;
  sector: string;
  inicio: string;
  fin: string | null;
  descripcion: string | null;
  responsable: string;
  estado: EstadoCampana;
}

export async function insertar(db: Db, id: string, d: DatosCampana, usuarioId: string, ts: number) {
  await db.run(
    `INSERT INTO campanas (id, nombre, sector, inicio, fin, descripcion, responsable, estado, creado_por, creado_at, actualizado_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, d.nombre, d.sector, d.inicio, d.fin, d.descripcion, d.responsable, d.estado, usuarioId, ts, ts],
  );
}

export async function actualizar(db: Db, id: string, d: DatosCampana, ts: number) {
  await db.run(
    `UPDATE campanas SET nombre=?, sector=?, inicio=?, fin=?, descripcion=?, responsable=?, estado=?, actualizado_at=?,
     sync_estado='PENDIENTE' WHERE id=?`,
    [d.nombre, d.sector, d.inicio, d.fin, d.descripcion, d.responsable, d.estado, ts, id],
  );
}

export async function contarAtenciones(db: Db, id: string): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones WHERE campana_id = ? AND anulado_at IS NULL', [id]);
  return r?.n ?? 0;
}
