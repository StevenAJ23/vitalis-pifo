import type { Db, SqlValue } from '../db/types';
import type { Evaluacion, EvaluacionSesion, Metodo } from '../domain/types';

export async function insertar(db: Db, e: Evaluacion) {
  await db.run(
    `INSERT INTO evaluacion (id, codigo, atencion_id, campana_id, metodo, operador, inicio, fin, duracion_s,
       tiempo_busqueda_s, errores_validacion, errores_verificados, incompletos, correcciones, conectividad,
       guardado_exitoso, creado_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      e.id, e.codigo, e.atencion_id, e.campana_id, e.metodo, e.operador, e.inicio, e.fin, e.duracion_s,
      e.tiempo_busqueda_s, e.errores_validacion, e.errores_verificados, e.incompletos, e.correcciones,
      e.conectividad, e.guardado_exitoso, e.creado_at,
    ],
  );
}

export async function sumarCorreccion(db: Db, atencionId: string) {
  await db.run('UPDATE evaluacion SET correcciones = correcciones + 1 WHERE atencion_id = ?', [atencionId]);
}

export async function fijarErroresVerificados(db: Db, id: string, errores: number) {
  const r = await db.run('UPDATE evaluacion SET errores_verificados = ? WHERE id = ?', [errores, id]);
  return r.changes;
}

export function porId(db: Db, id: string) {
  return db.get<Evaluacion>('SELECT * FROM evaluacion WHERE id = ?', [id]);
}

export function listar(db: Db, campanaId: string | null, metodo?: Metodo | null) {
  const cond: string[] = [];
  const p: SqlValue[] = [];
  if (campanaId) { cond.push('campana_id = ?'); p.push(campanaId); }
  if (metodo) { cond.push('metodo = ?'); p.push(metodo); }
  return db.all<Evaluacion>(
    `SELECT * FROM evaluacion ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY creado_at DESC`,
    p,
  );
}

export async function eliminarManual(db: Db, id: string) {
  // Solo registros manuales (papel/Excel) pueden retirarse: corresponden a errores de captura de la propia matriz.
  const r = await db.run("DELETE FROM evaluacion WHERE id = ? AND metodo <> 'DIGITAL'", [id]);
  return r.changes;
}

export async function insertarSesion(db: Db, s: EvaluacionSesion) {
  await db.run(
    `INSERT INTO evaluacion_sesion (id, campana_id, operador, metodo, satisfaccion, tiempo_consolidacion_s, hojas_papel, notas, fecha)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [s.id, s.campana_id, s.operador, s.metodo, s.satisfaccion, s.tiempo_consolidacion_s, s.hojas_papel, s.notas, s.fecha],
  );
}

export function sesiones(db: Db, campanaId: string | null) {
  return db.all<EvaluacionSesion>(
    `SELECT * FROM evaluacion_sesion ${campanaId ? 'WHERE campana_id = ?' : ''} ORDER BY fecha DESC`,
    campanaId ? [campanaId] : [],
  );
}
