import type { Db } from '../db/types';
import { TABLAS_DATOS } from '../db/migrations';
import { now } from '../platform/runtime';
import { guardarAjuste, leerTodos, type ModoDatos } from '../repositories/ajustes';
import { auditar } from '../repositories/auditoria';
import { contarAdminsActivos } from '../repositories/usuarios';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

export interface Chequeo {
  id: string;
  titulo: string;
  ok: boolean;
  detalle: string;
}

export interface EntornoSeguridad {
  sqlcipher: boolean;
  cipherVersion: string | null;
  claveEnAlmacenSeguro: boolean;
}

/** Controles verificados en tiempo real; todos deben cumplirse antes de tratar datos reales (criterio de salida §07). */
export async function chequeos(db: Db, entorno: EntornoSeguridad): Promise<Chequeo[]> {
  const a = await leerTodos(db);
  const fk = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const integ = await db.get<{ quick_check: string }>('PRAGMA quick_check');
  const admins = await contarAdminsActivos(db);
  const inact = Number(a.inactividad_min);
  const verif = Number(a.respaldo_verificado_at);
  return [
    { id: 'cifrado', titulo: 'Base de datos cifrada (SQLCipher)', ok: entorno.sqlcipher, detalle: entorno.sqlcipher ? `SQLCipher ${entorno.cipherVersion}` : 'El binario no incluye SQLCipher (p. ej. Expo Go). Use la compilación nativa.' },
    { id: 'clave', titulo: 'Clave de cifrado en almacén seguro', ok: entorno.claveEnAlmacenSeguro, detalle: entorno.claveEnAlmacenSeguro ? 'Android Keystore / iOS Keychain' : 'No se encontró la clave en SecureStore' },
    { id: 'auth', titulo: 'Autenticación local con administrador', ok: admins >= 1, detalle: `${admins} administrador(es) activo(s)` },
    { id: 'inactividad', titulo: 'Bloqueo por inactividad ≤ 10 min', ok: inact > 0 && inact <= 10, detalle: `${a.inactividad_min} min` },
    { id: 'fk', titulo: 'Integridad referencial activa', ok: fk?.foreign_keys === 1, detalle: fk?.foreign_keys === 1 ? 'PRAGMA foreign_keys = ON' : 'Desactivada' },
    { id: 'integridad', titulo: 'Integridad del archivo de base', ok: integ?.quick_check === 'ok', detalle: integ?.quick_check ?? 'sin resultado' },
    { id: 'respaldo', titulo: 'Respaldo cifrado y restauración probados', ok: Number.isFinite(verif) && verif > 0, detalle: verif > 0 ? `Verificado ${new Date(verif).toLocaleString()}` : 'Cree un respaldo y verifíquelo' },
  ];
}

export async function contarPacientes(db: Db): Promise<number> {
  const r = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM pacientes');
  return r?.n ?? 0;
}

/**
 * Habilita el modo de datos reales solo si: todos los controles pasan, el administrador registra la autorización
 * del consultorio (base jurídica, aviso de privacidad) y no quedan datos ficticios en la base.
 */
export async function cambiarModo(db: Db, actor: Actor, modo: ModoDatos, entorno: EntornoSeguridad, autorizacion?: { responsable: string; referencia: string }) {
  exigir(actor.rol, 'seguridad.gestionar');
  if (modo === 'REAL') {
    const fallidos = (await chequeos(db, entorno)).filter((c) => !c.ok);
    if (fallidos.length) throw new ErrorNegocio(`No se cumplen los controles: ${fallidos.map((c) => c.titulo).join('; ')}`);
    if (!autorizacion || autorizacion.responsable.trim().length < 3 || autorizacion.referencia.trim().length < 3) {
      throw new ErrorNegocio('Registre el responsable y la referencia de la autorización del consultorio.');
    }
  }
  if ((await contarPacientes(db)) > 0) {
    throw new ErrorNegocio('La base contiene registros. Para cambiar de modo, primero elimine los datos de prueba.');
  }
  await db.transaction(async (tx) => {
    await guardarAjuste(tx, 'modo_datos', modo);
    if (modo === 'REAL' && autorizacion) {
      await guardarAjuste(tx, 'autorizacion_real', JSON.stringify({ ...autorizacion, fecha: now(), usuario: actor.id }));
    }
    await auditar(tx, { usuarioId: actor.id, entidad: 'sistema', accion: 'MODO_DATOS', detalle: modo });
  });
}

/** Elimina todos los datos de negocio. Solo permitido en modo de prueba (datos ficticios). */
export async function purgarDatosPrueba(db: Db, actor: Actor, modoActual: ModoDatos) {
  exigir(actor.rol, 'seguridad.gestionar');
  if (modoActual !== 'SINTETICO') throw new ErrorNegocio('Solo se pueden purgar datos en modo de prueba.');
  await db.transaction(async (tx) => {
    for (const t of TABLAS_DATOS) await tx.run(`DELETE FROM ${t}`);
    await tx.run('DELETE FROM secuencias');
    await guardarAjuste(tx, 'campana_activa_id', '');
    await auditar(tx, { usuarioId: actor.id, entidad: 'sistema', accion: 'PURGAR_DATOS', detalle: 'datos de prueba eliminados' });
  });
}

export interface ResumenDatosPrueba {
  pacientes: number;
  atenciones: number;
  campanas: number;
  rutas: number;
  evaluaciones: number;
}

export async function resumenDatos(db: Db): Promise<ResumenDatosPrueba> {
  const r = await db.get<ResumenDatosPrueba>(
    `SELECT (SELECT COUNT(*) FROM pacientes) AS pacientes, (SELECT COUNT(*) FROM atenciones) AS atenciones,
       (SELECT COUNT(*) FROM campanas) AS campanas, (SELECT COUNT(*) FROM rutas) AS rutas,
       (SELECT COUNT(*) FROM evaluacion) AS evaluaciones`,
  );
  return r ?? { pacientes: 0, atenciones: 0, campanas: 0, rutas: 0, evaluaciones: 0 };
}

/**
 * Paso único "borrar datos de prueba y pasar a datos reales": en UNA transacción elimina todos los datos de
 * prueba (pacientes, atenciones, campañas, recorridos, evaluaciones y su auditoría), activa el modo REAL y
 * registra la autorización del consultorio. Los usuarios y sus contraseñas se conservan.
 * Requiere: modo de prueba, todos los controles de seguridad en verde y ningún recorrido GPS abierto.
 */
export async function pasarADatosReales(db: Db, actor: Actor, entorno: EntornoSeguridad, autorizacion: { responsable: string; referencia: string }) {
  exigir(actor.rol, 'seguridad.gestionar');
  const a = await leerTodos(db);
  if (a.modo_datos === 'REAL') throw new ErrorNegocio('La app ya está en modo de datos reales.');
  if (autorizacion.responsable.trim().length < 3 || autorizacion.referencia.trim().length < 3) {
    throw new ErrorNegocio('Registre el responsable y la referencia de la autorización del consultorio.');
  }
  const fallidos = (await chequeos(db, entorno)).filter((c) => !c.ok);
  if (fallidos.length) throw new ErrorNegocio(`Falta completar: ${fallidos.map((c) => c.titulo).join('; ')}.`);
  const abierta = await db.get<{ id: string }>("SELECT id FROM rutas WHERE estado <> 'FINALIZADA' LIMIT 1");
  if (abierta) throw new ErrorNegocio('Finalice el recorrido GPS abierto antes de borrar los datos de prueba.');
  const borrado = await resumenDatos(db);
  await db.transaction(async (tx) => {
    for (const t of TABLAS_DATOS) await tx.run(`DELETE FROM ${t}`);
    await tx.run('DELETE FROM secuencias');
    await guardarAjuste(tx, 'campana_activa_id', '');
    await guardarAjuste(tx, 'modo_datos', 'REAL');
    await guardarAjuste(tx, 'autorizacion_real', JSON.stringify({ ...autorizacion, fecha: now(), usuario: actor.id }));
    await auditar(tx, { usuarioId: actor.id, entidad: 'sistema', accion: 'PURGAR_DATOS', detalle: `datos de prueba eliminados: ${JSON.stringify(borrado)}` });
    await auditar(tx, { usuarioId: actor.id, entidad: 'sistema', accion: 'MODO_DATOS', detalle: 'REAL' });
  });
  return borrado;
}
