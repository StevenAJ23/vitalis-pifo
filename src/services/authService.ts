import type { Db } from '../db/types';
import type { Rol, Usuario } from '../domain/types';
import { now, uuid } from '../platform/runtime';
import * as repo from '../repositories/usuarios';
import { auditar } from '../repositories/auditoria';
import { exigir } from '../security/permissions';
import { ITERACIONES_CREDENCIAL, iteracionesDe, protegerCredencial, validarPoliticaClave, verificarCredencial } from '../security/passwords';
import { sha256 } from '@noble/hashes/sha2.js';
import { aHex, igualesTiempoConstante, utf8 } from '../security/encoding';
import { ErrorNegocio, type Actor } from './contexto';

export const MAX_INTENTOS = 5;
const BLOQUEO_BASE_MS = 5 * 60 * 1000;
const BLOQUEO_MAX_MS = 60 * 60 * 1000;

export class ErrorAutenticacion extends Error {
  constructor(mensaje: string, public readonly bloqueadoHasta: number | null = null) {
    super(mensaje);
    this.name = 'ErrorAutenticacion';
  }
}

export function aActor(u: Usuario): Actor {
  return { id: u.id, nombre: u.nombre, rol: u.rol, codigo_operador: u.codigo_operador };
}

export async function requiereConfiguracionInicial(db: Db): Promise<boolean> {
  return (await repo.contarUsuarios(db)) === 0;
}

export async function crearAdminInicial(db: Db, d: { nombre: string; usuario: string; clave: string }): Promise<Usuario> {
  const err = validarPoliticaClave(d.clave);
  if (err) throw new ErrorNegocio(err);
  const credencial = await protegerCredencial(d.clave);
  const id = uuid();
  await db.transaction(async (tx) => {
    if ((await repo.contarUsuarios(tx)) > 0) throw new ErrorNegocio('La configuración inicial ya fue realizada.');
    await repo.insertar(tx, { id, usuario: d.usuario, nombre: d.nombre, rol: 'ADMIN', codigo_operador: 'OP-01', credencial, debe_cambiar_clave: false, ts: now() });
    await auditar(tx, { usuarioId: id, entidad: 'usuarios', entidadId: id, accion: 'CREAR', detalle: 'Administrador inicial' });
  });
  return (await repo.porId(db, id))!;
}

const MENSAJE_GENERICO = 'Usuario o contraseña incorrectos.';

async function registrarFalloLogin(db: Db, u: Usuario): Promise<number | null> {
  const intentos = u.intentos_fallidos + 1;
  let hasta: number | null = null;
  if (intentos >= MAX_INTENTOS) {
    hasta = now() + Math.min(BLOQUEO_MAX_MS, BLOQUEO_BASE_MS * 2 ** (intentos - MAX_INTENTOS));
  }
  await repo.registrarFallo(db, u.id, intentos, hasta);
  await auditar(db, { usuarioId: u.id, entidad: 'usuarios', entidadId: u.id, accion: hasta ? 'LOGIN_BLOQUEADO' : 'LOGIN_FALLIDO', detalle: `intento ${intentos}` });
  return hasta;
}

/**
 * Autenticación local. Mensaje genérico ante usuario inexistente o clave errónea (no revela cuál falló).
 * Bloqueo progresivo tras 5 intentos fallidos.
 */
export async function iniciarSesion(db: Db, usuario: string, clave: string): Promise<Usuario> {
  const u = await repo.porUsuario(db, usuario);
  if (!u) {
    // Coste equivalente para no revelar la existencia del usuario por tiempo de respuesta.
    await verificarCredencial(clave, 'pbkdf2-sha256$20000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    await auditar(db, { usuarioId: null, entidad: 'usuarios', accion: 'LOGIN_FALLIDO', detalle: 'usuario desconocido' });
    throw new ErrorAutenticacion(MENSAJE_GENERICO);
  }
  if (u.bloqueado_hasta && u.bloqueado_hasta > now()) {
    throw new ErrorAutenticacion('Cuenta bloqueada temporalmente por intentos fallidos.', u.bloqueado_hasta);
  }
  const credencial = await repo.credencialDe(db, u.id);
  const ok = await verificarCredencial(clave, credencial);
  if (!ok || !u.activo) {
    if (!ok) {
      const hasta = await registrarFalloLogin(db, u);
      if (hasta) throw new ErrorAutenticacion('Demasiados intentos. Cuenta bloqueada temporalmente.', hasta);
      throw new ErrorAutenticacion(MENSAJE_GENERICO);
    }
    throw new ErrorAutenticacion('La cuenta está desactivada. Contacte al administrador.');
  }
  await repo.reiniciarFallos(db, u.id);
  if (iteracionesDe(credencial) !== ITERACIONES_CREDENCIAL) {
    // Migración transparente de parámetros (p. ej. 60 000 → 20 000 iteraciones): ingresos posteriores más rápidos.
    await repo.reemplazarHash(db, u.id, await protegerCredencial(clave));
  }
  await auditar(db, { usuarioId: u.id, entidad: 'usuarios', entidadId: u.id, accion: 'LOGIN_OK' });
  return (await repo.porId(db, u.id))!;
}

/** Verificación para desbloquear la sesión tras inactividad (cuenta como intento de autenticación). */
export async function verificarParaDesbloqueo(db: Db, usuarioId: string, clave: string): Promise<void> {
  const u = await repo.porId(db, usuarioId);
  if (!u || !u.activo) throw new ErrorAutenticacion('La cuenta ya no está activa.');
  if (u.bloqueado_hasta && u.bloqueado_hasta > now()) throw new ErrorAutenticacion('Cuenta bloqueada temporalmente.', u.bloqueado_hasta);
  if (!(await verificarCredencial(clave, await repo.credencialDe(db, u.id)))) {
    const hasta = await registrarFalloLogin(db, u);
    throw new ErrorAutenticacion(hasta ? 'Demasiados intentos. Cuenta bloqueada.' : 'Contraseña incorrecta.', hasta);
  }
  await repo.reiniciarFallos(db, u.id);
}

export async function cambiarClave(db: Db, actor: Actor, actual: string, nueva: string): Promise<void> {
  const err = validarPoliticaClave(nueva);
  if (err) throw new ErrorNegocio(err);
  if (!(await verificarCredencial(actual, await repo.credencialDe(db, actor.id)))) {
    throw new ErrorNegocio('La contraseña actual no es correcta.');
  }
  const cred = await protegerCredencial(nueva);
  await db.transaction(async (tx) => {
    await repo.fijarCredencial(tx, actor.id, cred, false, now());
    await auditar(tx, { usuarioId: actor.id, entidad: 'usuarios', entidadId: actor.id, accion: 'CAMBIO_CLAVE' });
  });
}

export async function crearUsuario(
  db: Db,
  actor: Actor,
  d: { nombre: string; usuario: string; rol: Rol; clave: string },
): Promise<string> {
  exigir(actor.rol, 'usuarios.gestionar');
  const err = validarPoliticaClave(d.clave);
  if (err) throw new ErrorNegocio(err);
  if (await repo.porUsuario(db, d.usuario)) throw new ErrorNegocio('El nombre de usuario ya existe.');
  const cred = await protegerCredencial(d.clave);
  const id = uuid();
  await db.transaction(async (tx) => {
    const codigo = await repo.siguienteCodigoOperador(tx);
    await repo.insertar(tx, { id, usuario: d.usuario, nombre: d.nombre, rol: d.rol, codigo_operador: codigo, credencial: cred, debe_cambiar_clave: true, ts: now() });
    await auditar(tx, { usuarioId: actor.id, entidad: 'usuarios', entidadId: id, accion: 'CREAR', detalle: `rol ${d.rol}` });
  });
  return id;
}

export async function actualizarUsuario(db: Db, actor: Actor, id: string, d: { nombre: string; rol: Rol; activo: boolean }) {
  exigir(actor.rol, 'usuarios.gestionar');
  await db.transaction(async (tx) => {
    const u = await repo.porId(tx, id);
    if (!u) throw new ErrorNegocio('Usuario no encontrado.');
    const pierdeAdmin = u.rol === 'ADMIN' && u.activo === 1 && (d.rol !== 'ADMIN' || !d.activo);
    if (pierdeAdmin && (await repo.contarAdminsActivos(tx)) <= 1) {
      throw new ErrorNegocio('Debe existir al menos un administrador activo.');
    }
    await repo.actualizarDatos(tx, id, { ...d, ts: now() });
    await auditar(tx, { usuarioId: actor.id, entidad: 'usuarios', entidadId: id, accion: 'ACTUALIZAR', detalle: `rol ${d.rol}, activo ${d.activo ? 1 : 0}` });
  });
}

export async function restablecerClave(db: Db, actor: Actor, id: string, temporal: string) {
  exigir(actor.rol, 'usuarios.gestionar');
  const err = validarPoliticaClave(temporal);
  if (err) throw new ErrorNegocio(err);
  const cred = await protegerCredencial(temporal);
  await db.transaction(async (tx) => {
    await repo.fijarCredencial(tx, id, cred, true, now());
    await auditar(tx, { usuarioId: actor.id, entidad: 'usuarios', entidadId: id, accion: 'CAMBIO_CLAVE', detalle: 'restablecida por administrador' });
  });
}

/* ------------------------- Inicio de sesión biométrico ------------------------- */

/**
 * El dispositivo guarda un token aleatorio de 256 bits en el almacén seguro protegido por huella/rostro
 * (SecureStore con requireAuthentication). En la base solo se guarda su SHA-256. La contraseña nunca se almacena.
 * Cambiar o restablecer la contraseña invalida la biometría.
 */
function hashToken(token: string): string {
  return aHex(sha256(utf8(token)));
}

export async function activarBiometria(db: Db, actor: Actor, token: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new ErrorNegocio('Token biométrico inválido.');
  await db.transaction(async (tx) => {
    await repo.fijarBiometria(tx, actor.id, hashToken(token));
    await auditar(tx, { usuarioId: actor.id, entidad: 'usuarios', entidadId: actor.id, accion: 'AJUSTE', detalle: 'biometría activada' });
  });
}

export async function desactivarBiometria(db: Db, usuarioId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await repo.fijarBiometria(tx, usuarioId, null);
    await auditar(tx, { usuarioId, entidad: 'usuarios', entidadId: usuarioId, accion: 'AJUSTE', detalle: 'biometría desactivada' });
  });
}

async function validarToken(db: Db, u: Usuario, token: string): Promise<void> {
  if (!u.activo) throw new ErrorAutenticacion('La cuenta está desactivada. Contacte al administrador.');
  if (u.bloqueado_hasta && u.bloqueado_hasta > now()) throw new ErrorAutenticacion('Cuenta bloqueada temporalmente.', u.bloqueado_hasta);
  if (u.debe_cambiar_clave) throw new ErrorAutenticacion('Debe ingresar con su contraseña para cambiarla.');
  const guardado = await repo.biometriaHashDe(db, u.id);
  if (!guardado || !igualesTiempoConstante(utf8(hashToken(token)), utf8(guardado))) {
    throw new ErrorAutenticacion('La huella o rostro ya no es válido en este dispositivo. Ingrese con su contraseña y vuelva a activarlo.');
  }
}

export async function iniciarSesionBiometrica(db: Db, usuarioId: string, token: string): Promise<Usuario> {
  const u = await repo.porId(db, usuarioId);
  if (!u) throw new ErrorAutenticacion('Usuario no encontrado.');
  await validarToken(db, u, token);
  await repo.reiniciarFallos(db, u.id);
  await auditar(db, { usuarioId: u.id, entidad: 'usuarios', entidadId: u.id, accion: 'LOGIN_OK', detalle: 'biometría' });
  return (await repo.porId(db, u.id))!;
}

export async function desbloquearBiometrico(db: Db, usuarioId: string, token: string): Promise<void> {
  const u = await repo.porId(db, usuarioId);
  if (!u) throw new ErrorAutenticacion('Usuario no encontrado.');
  await validarToken(db, u, token);
}
