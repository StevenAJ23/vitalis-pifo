import type { Db } from '../db/types';
import type { Rol, Usuario } from '../domain/types';

const COLUMNAS = `id, usuario, nombre, rol, codigo_operador, activo, intentos_fallidos, bloqueado_hasta,
  debe_cambiar_clave, (credencial_protegida IS NOT NULL) AS tiene_credencial, creado_at, actualizado_at`;

export async function contarUsuarios(db: Db): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios');
  return r?.n ?? 0;
}

export async function contarAdminsActivos(db: Db): Promise<number> {
  const r = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'ADMIN' AND activo = 1 AND credencial_protegida IS NOT NULL",
  );
  return r?.n ?? 0;
}

export function porId(db: Db, id: string) {
  return db.get<Usuario>(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [id]);
}

export function porUsuario(db: Db, usuario: string) {
  return db.get<Usuario>(`SELECT ${COLUMNAS} FROM usuarios WHERE usuario = ? COLLATE NOCASE`, [usuario.trim()]);
}

export async function credencialDe(db: Db, id: string): Promise<string | null> {
  const r = await db.get<{ c: string | null }>('SELECT credencial_protegida AS c FROM usuarios WHERE id = ?', [id]);
  return r?.c ?? null;
}

export function listar(db: Db) {
  return db.all<Usuario>(`SELECT ${COLUMNAS} FROM usuarios ORDER BY activo DESC, nombre`);
}

export async function insertar(
  db: Db,
  u: { id: string; usuario: string; nombre: string; rol: Rol; codigo_operador: string; credencial: string; debe_cambiar_clave: boolean; ts: number },
) {
  await db.run(
    `INSERT INTO usuarios (id, usuario, nombre, rol, credencial_protegida, codigo_operador, activo, debe_cambiar_clave, creado_at, actualizado_at)
     VALUES (?,?,?,?,?,?,1,?,?,?)`,
    [u.id, u.usuario.trim(), u.nombre.trim(), u.rol, u.credencial, u.codigo_operador, u.debe_cambiar_clave ? 1 : 0, u.ts, u.ts],
  );
}

export async function actualizarDatos(db: Db, id: string, d: { nombre: string; rol: Rol; activo: boolean; ts: number }) {
  await db.run('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, actualizado_at = ? WHERE id = ?', [
    d.nombre.trim(), d.rol, d.activo ? 1 : 0, d.ts, id,
  ]);
}

export async function fijarCredencial(db: Db, id: string, credencial: string, debeCambiar: boolean, ts: number) {
  await db.run(
    `UPDATE usuarios SET credencial_protegida = ?, debe_cambiar_clave = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, biometria_hash = NULL,
     actualizado_at = ? WHERE id = ?`,
    [credencial, debeCambiar ? 1 : 0, ts, id],
  );
}

/** Recalcula el hash de la misma contraseña (cambio de parámetros) sin afectar biometría ni bloqueos. */
export async function reemplazarHash(db: Db, id: string, credencial: string) {
  await db.run('UPDATE usuarios SET credencial_protegida = ? WHERE id = ?', [credencial, id]);
}

export async function fijarBiometria(db: Db, id: string, hash: string | null) {
  await db.run('UPDATE usuarios SET biometria_hash = ? WHERE id = ?', [hash, id]);
}

export async function biometriaHashDe(db: Db, id: string): Promise<string | null> {
  const r = await db.get<{ h: string | null }>('SELECT biometria_hash AS h FROM usuarios WHERE id = ?', [id]);
  return r?.h ?? null;
}

export async function registrarFallo(db: Db, id: string, intentos: number, bloqueadoHasta: number | null) {
  await db.run('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?', [intentos, bloqueadoHasta, id]);
}

export async function reiniciarFallos(db: Db, id: string) {
  await db.run('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [id]);
}

export async function siguienteCodigoOperador(db: Db): Promise<string> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios');
  return `OP-${String((r?.n ?? 0) + 1).padStart(2, '0')}`;
}
