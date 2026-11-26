import type { Db, SqlValue } from '../db/types';
import type { Atencion, AtencionConPaciente, Oido } from '../domain/types';

const SELECT_COMPLETO = `SELECT a.*, p.codigo AS paciente_codigo, (p.nombres || ' ' || p.apellidos) AS paciente_nombre,
  p.sector AS paciente_sector, c.nombre AS campana_nombre, u.nombre AS usuario_nombre
  FROM atenciones a
  JOIN pacientes p ON p.id = a.paciente_id
  JOIN campanas c ON c.id = a.campana_id
  LEFT JOIN usuarios u ON u.id = a.usuario_id`;

export interface DatosClinicos {
  sistolica: number | null;
  diastolica: number | null;
  frecuencia: number | null;
  temperatura: number | null;
  spo2: number | null;
  peso: number | null;
  talla_cm: number | null;
  imc: number | null;
  oido_i: Oido;
  oido_d: Oido;
  observaciones: string | null;
  seguimiento: boolean;
  cita_at: string | null;
  requiere_revision: boolean;
}

export const CAMPOS_CLINICOS: (keyof DatosClinicos)[] = [
  'sistolica', 'diastolica', 'frecuencia', 'temperatura', 'spo2', 'peso', 'talla_cm', 'imc',
  'oido_i', 'oido_d', 'observaciones', 'seguimiento', 'cita_at', 'requiere_revision',
];

function valores(d: DatosClinicos): SqlValue[] {
  return [
    d.sistolica, d.diastolica, d.frecuencia, d.temperatura, d.spo2, d.peso, d.talla_cm, d.imc,
    d.oido_i, d.oido_d, d.observaciones, d.seguimiento ? 1 : 0, d.cita_at, d.requiere_revision ? 1 : 0,
  ];
}

export async function insertar(
  db: Db,
  a: { id: string; pacienteId: string; campanaId: string; usuarioId: string; fecha: number; ts: number },
  d: DatosClinicos,
) {
  await db.run(
    `INSERT INTO atenciones (id, paciente_id, campana_id, usuario_id, fecha,
       sistolica, diastolica, frecuencia, temperatura, spo2, peso, talla_cm, imc, oido_i, oido_d, observaciones,
       seguimiento, cita_at, requiere_revision, creado_at, actualizado_at)
     VALUES (?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?, ?,?,?, ?,?)`,
    [a.id, a.pacienteId, a.campanaId, a.usuarioId, a.fecha, ...valores(d), a.ts, a.ts],
  );
}

export async function actualizarClinicos(db: Db, id: string, d: DatosClinicos, versionEsperada: number, ts: number) {
  const r = await db.run(
    `UPDATE atenciones SET sistolica=?, diastolica=?, frecuencia=?, temperatura=?, spo2=?, peso=?, talla_cm=?, imc=?,
       oido_i=?, oido_d=?, observaciones=?, seguimiento=?, cita_at=?, requiere_revision=?,
       revisado_por = NULL, revisado_at = NULL,
       version = version + 1, actualizado_at = ?, sync_estado = 'PENDIENTE'
     WHERE id = ? AND version = ? AND anulado_at IS NULL`,
    [...valores(d), ts, id, versionEsperada],
  );
  return r.changes;
}

export async function guardarVersion(
  db: Db,
  v: { id: string; atencionId: string; version: number; datos: string; usuarioId: string; motivo: string; ts: number },
) {
  await db.run(
    'INSERT INTO atenciones_versiones (id, atencion_id, version, datos, usuario_id, fecha, motivo) VALUES (?,?,?,?,?,?,?)',
    [v.id, v.atencionId, v.version, v.datos, v.usuarioId, v.ts, v.motivo],
  );
}

export function versiones(db: Db, atencionId: string) {
  return db.all<{ id: string; version: number; fecha: number; motivo: string; usuario_nombre: string | null }>(
    `SELECT v.id, v.version, v.fecha, v.motivo, u.nombre AS usuario_nombre FROM atenciones_versiones v
     LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.atencion_id = ? ORDER BY v.version DESC`,
    [atencionId],
  );
}

export function porId(db: Db, id: string) {
  return db.get<AtencionConPaciente>(`${SELECT_COMPLETO} WHERE a.id = ?`, [id]);
}

export function crudaPorId(db: Db, id: string) {
  return db.get<Atencion>('SELECT * FROM atenciones WHERE id = ?', [id]);
}

export function dePaciente(db: Db, pacienteId: string) {
  return db.all<AtencionConPaciente>(`${SELECT_COMPLETO} WHERE a.paciente_id = ? ORDER BY a.fecha DESC`, [pacienteId]);
}

export interface FiltroHistorial {
  campanaId?: string | null;
  sector?: string | null;
  desdeMs?: number | null;
  hastaMs?: number | null;
  soloRevision?: boolean;
  soloSeguimiento?: boolean;
  incluirAnuladas?: boolean;
  limite?: number;
  offset?: number;
}

export function historial(db: Db, f: FiltroHistorial) {
  const cond: string[] = [];
  const p: SqlValue[] = [];
  if (!f.incluirAnuladas) cond.push('a.anulado_at IS NULL');
  if (f.campanaId) { cond.push('a.campana_id = ?'); p.push(f.campanaId); }
  if (f.sector) { cond.push('p.sector = ?'); p.push(f.sector); }
  if (f.desdeMs != null) { cond.push('a.fecha >= ?'); p.push(f.desdeMs); }
  if (f.hastaMs != null) { cond.push('a.fecha <= ?'); p.push(f.hastaMs); }
  if (f.soloRevision) cond.push('a.requiere_revision = 1 AND a.revisado_at IS NULL');
  if (f.soloSeguimiento) cond.push('a.seguimiento = 1');
  p.push(Math.min(f.limite ?? 50, 200), f.offset ?? 0);
  return db.all<AtencionConPaciente>(
    `${SELECT_COMPLETO} ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY a.fecha DESC LIMIT ? OFFSET ?`,
    p,
  );
}

export async function marcarRevisada(db: Db, id: string, usuarioId: string, ts: number) {
  const r = await db.run(
    `UPDATE atenciones SET revisado_por=?, revisado_at=?, actualizado_at=?, sync_estado='PENDIENTE'
     WHERE id=? AND requiere_revision=1 AND revisado_at IS NULL AND anulado_at IS NULL`,
    [usuarioId, ts, ts, id],
  );
  return r.changes;
}

export async function anular(db: Db, id: string, usuarioId: string, motivo: string, ts: number) {
  const r = await db.run(
    `UPDATE atenciones SET anulado_at=?, anulado_por=?, motivo_anulacion=?, actualizado_at=?, sync_estado='PENDIENTE'
     WHERE id=? AND anulado_at IS NULL`,
    [ts, usuarioId, motivo, ts, id],
  );
  return r.changes;
}

export async function contarDePaciente(db: Db, pacienteId: string): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones WHERE paciente_id = ? AND anulado_at IS NULL', [pacienteId]);
  return r?.n ?? 0;
}
