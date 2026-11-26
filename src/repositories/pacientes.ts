import type { Db } from '../db/types';
import type { Canal, CamposOpcionales, Paciente } from '../domain/types';
import { escaparLike, normalizar } from '../domain/text';

interface FilaPaciente extends Omit<Paciente, 'campos_opcionales' | 'consentimiento_contacto'> {
  campos_opcionales: string;
  consentimiento_estado: string | null;
}

const SELECT = `SELECT p.id, p.codigo, p.nombres, p.apellidos, p.edad, p.sector, p.telefono, p.campos_opcionales,
  p.canal_preferido, p.creado_por, p.creado_at, p.actualizado_at, p.anulado_at, p.version,
  (SELECT c.estado FROM consentimientos c WHERE c.paciente_id = p.id AND c.finalidad = 'CONTACTO_SEGUIMIENTO'
     ORDER BY c.fecha DESC LIMIT 1) AS consentimiento_estado,
  (SELECT COUNT(*) FROM atenciones a WHERE a.paciente_id = p.id AND a.anulado_at IS NULL) AS n_atenciones,
  (SELECT MAX(a.fecha) FROM atenciones a WHERE a.paciente_id = p.id AND a.anulado_at IS NULL) AS ultima_atencion
  FROM pacientes p`;

function mapear(f: FilaPaciente): Paciente {
  let opc: CamposOpcionales = {};
  try {
    opc = JSON.parse(f.campos_opcionales || '{}') as CamposOpcionales;
  } catch {
    opc = {};
  }
  const { consentimiento_estado, ...resto } = f;
  return { ...resto, campos_opcionales: opc, consentimiento_contacto: consentimiento_estado === 'OTORGADO' };
}

export async function porId(db: Db, id: string): Promise<Paciente | null> {
  const f = await db.get<FilaPaciente>(`${SELECT} WHERE p.id = ?`, [id]);
  return f ? mapear(f) : null;
}

/**
 * Búsqueda por código, nombres/apellidos (normalizados), celular o cédula. Excluye anulados.
 * Los términos se pasan como parámetros con ESCAPE para impedir inyección y comodines no deseados.
 */
export async function buscar(db: Db, consulta: string, limite = 30): Promise<Paciente[]> {
  const q = consulta.trim();
  if (!q) {
    const filas = await db.all<FilaPaciente>(`${SELECT} WHERE p.anulado_at IS NULL ORDER BY p.actualizado_at DESC LIMIT ?`, [limite]);
    return filas.map(mapear);
  }
  const terminos = normalizar(q).split(' ').filter(Boolean).slice(0, 4);
  const cond: string[] = [];
  const params: (string | number)[] = [];
  for (const t of terminos) {
    cond.push("p.nombre_norm LIKE ? ESCAPE '\\'");
    params.push(`%${escaparLike(t)}%`);
  }
  const nombreCond = cond.length ? `(${cond.join(' AND ')})` : '0';
  const crudo = q.toUpperCase();
  const filas = await db.all<FilaPaciente>(
    `${SELECT} WHERE p.anulado_at IS NULL AND (
       ${nombreCond}
       OR p.codigo LIKE ? ESCAPE '\\'
       OR p.telefono = ?
       OR json_extract(p.campos_opcionales, '$.cedula') = ?
     ) ORDER BY (p.codigo = ?) DESC, p.apellidos, p.nombres LIMIT ?`,
    [...params, `%${escaparLike(crudo)}%`, q, q, crudo, limite],
  );
  return filas.map(mapear);
}

/** Candidatos para detección de duplicados (coincidencia amplia por apellidos, celular o cédula). */
export async function candidatosDuplicado(
  db: Db,
  d: { apellidos: string; telefono: string | null; cedula: string | null },
): Promise<Paciente[]> {
  const ap = normalizar(d.apellidos).split(' ')[0] ?? '';
  const filas = await db.all<FilaPaciente>(
    `${SELECT} WHERE p.anulado_at IS NULL AND (
       (? <> '' AND p.nombre_norm LIKE ? ESCAPE '\\')
       OR (? IS NOT NULL AND p.telefono = ?)
       OR (? IS NOT NULL AND json_extract(p.campos_opcionales, '$.cedula') = ?)
     ) LIMIT 50`,
    [ap, `%${escaparLike(ap.slice(0, Math.max(3, ap.length - 1)))}%`, d.telefono, d.telefono, d.cedula, d.cedula],
  );
  return filas.map(mapear);
}

export interface DatosPacienteBd {
  nombres: string;
  apellidos: string;
  edad: number | null;
  sector: string;
  telefono: string | null;
  campos_opcionales: CamposOpcionales;
  canal_preferido: Canal;
}

export async function insertar(db: Db, id: string, codigo: string, d: DatosPacienteBd, usuarioId: string, ts: number) {
  await db.run(
    `INSERT INTO pacientes (id, codigo, nombres, apellidos, nombre_norm, edad, sector, telefono, campos_opcionales,
       canal_preferido, creado_por, creado_at, actualizado_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, codigo, d.nombres, d.apellidos, normalizar(`${d.nombres} ${d.apellidos}`), d.edad, d.sector, d.telefono,
      JSON.stringify(d.campos_opcionales), d.canal_preferido, usuarioId, ts, ts,
    ],
  );
}

export async function actualizar(db: Db, id: string, d: DatosPacienteBd, ts: number) {
  await db.run(
    `UPDATE pacientes SET nombres=?, apellidos=?, nombre_norm=?, edad=?, sector=?, telefono=?, campos_opcionales=?,
       canal_preferido=?, actualizado_at=?, version = version + 1, sync_estado='PENDIENTE' WHERE id=?`,
    [
      d.nombres, d.apellidos, normalizar(`${d.nombres} ${d.apellidos}`), d.edad, d.sector, d.telefono,
      JSON.stringify(d.campos_opcionales), d.canal_preferido, ts, id,
    ],
  );
}

export async function anular(db: Db, id: string, usuarioId: string, motivo: string, ts: number) {
  await db.run(
    `UPDATE pacientes SET anulado_at=?, anulado_por=?, motivo_anulacion=?, actualizado_at=?, sync_estado='PENDIENTE'
     WHERE id=? AND anulado_at IS NULL`,
    [ts, usuarioId, motivo, ts, id],
  );
}

export async function registrarConsentimiento(
  db: Db,
  c: { id: string; pacienteId: string; canal: Canal; otorgado: boolean; versionAviso: string; usuarioId: string; ts: number },
) {
  await db.run(
    `INSERT INTO consentimientos (id, paciente_id, finalidad, canal, estado, fecha, version_aviso, usuario_id)
     VALUES (?,?,'CONTACTO_SEGUIMIENTO',?,?,?,?,?)`,
    [c.id, c.pacienteId, c.canal, c.otorgado ? 'OTORGADO' : 'REVOCADO', c.ts, c.versionAviso, c.usuarioId],
  );
}

export function consentimientosDe(db: Db, pacienteId: string) {
  return db.all<{ id: string; canal: string; estado: string; fecha: number; version_aviso: string }>(
    'SELECT id, canal, estado, fecha, version_aviso FROM consentimientos WHERE paciente_id = ? ORDER BY fecha DESC',
    [pacienteId],
  );
}

export async function sectoresConocidos(db: Db): Promise<string[]> {
  const filas = await db.all<{ sector: string }>(
    `SELECT sector FROM (SELECT sector FROM pacientes UNION SELECT sector FROM campanas) WHERE sector <> '' ORDER BY sector`,
  );
  return filas.map((f) => f.sector);
}
