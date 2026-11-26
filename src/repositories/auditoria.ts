import type { Db } from '../db/types';
import type { Auditoria } from '../domain/types';
import { now, uuid } from '../platform/runtime';

export type AccionAuditoria =
  | 'CREAR' | 'ACTUALIZAR' | 'CORREGIR' | 'ANULAR' | 'REVISAR' | 'VER_FICHA'
  | 'LOGIN_OK' | 'LOGIN_FALLIDO' | 'LOGIN_BLOQUEADO' | 'LOGOUT' | 'BLOQUEO_INACTIVIDAD' | 'CAMBIO_CLAVE'
  | 'EXPORTAR_CSV' | 'EXPORTAR_GEOJSON' | 'RESPALDO_CREAR' | 'RESPALDO_VERIFICAR' | 'RESPALDO_RESTAURAR'
  | 'RUTA_INICIAR' | 'RUTA_PAUSAR' | 'RUTA_REANUDAR' | 'RUTA_FINALIZAR' | 'RUTA_INTERRUMPIDA' | 'RUTA_DEPURAR'
  | 'AJUSTE' | 'MODO_DATOS' | 'DATOS_SINTETICOS' | 'PURGAR_DATOS';

/**
 * Registra un evento de auditoría. El detalle NUNCA debe contener valores clínicos ni datos personales:
 * solo nombres de campos modificados, conteos o motivos generales.
 */
export async function auditar(
  db: Db,
  e: { usuarioId: string | null; entidad: string; entidadId?: string | null; accion: AccionAuditoria; detalle?: string | null },
): Promise<void> {
  await db.run(
    'INSERT INTO auditoria (id, usuario_id, entidad, entidad_id, accion, fecha, detalle) VALUES (?,?,?,?,?,?,?)',
    [uuid(), e.usuarioId, e.entidad, e.entidadId ?? null, e.accion, now(), e.detalle ?? null],
  );
}

export interface FiltroAuditoria {
  desdeMs?: number;
  hastaMs?: number;
  accion?: string;
  limite?: number;
  offset?: number;
}

export interface AuditoriaConUsuario extends Auditoria {
  usuario_nombre: string | null;
}

export async function listarAuditoria(db: Db, f: FiltroAuditoria = {}): Promise<AuditoriaConUsuario[]> {
  const cond: string[] = [];
  const params: (string | number)[] = [];
  if (f.desdeMs != null) { cond.push('a.fecha >= ?'); params.push(f.desdeMs); }
  if (f.hastaMs != null) { cond.push('a.fecha <= ?'); params.push(f.hastaMs); }
  if (f.accion) { cond.push('a.accion = ?'); params.push(f.accion); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(Math.min(f.limite ?? 100, 500), f.offset ?? 0);
  return db.all<AuditoriaConUsuario>(
    `SELECT a.*, u.nombre AS usuario_nombre FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
     ${where} ORDER BY a.fecha DESC LIMIT ? OFFSET ?`,
    params,
  );
}
