import type { Db } from '../db/types';
import { calcularImc } from '../domain/imc';
import type { AtencionConPaciente, Conectividad } from '../domain/types';
import { contarFaltantes, detectarAtipicos } from '../domain/vitals';
import { now, uuid } from '../platform/runtime';
import * as repo from '../repositories/atenciones';
import { CAMPOS_CLINICOS } from '../repositories/atenciones';
import { auditar } from '../repositories/auditoria';
import * as campanas from '../repositories/campanas';
import * as evalRepo from '../repositories/evaluacion';
import * as pacientes from '../repositories/pacientes';
import * as rutasRepo from '../repositories/rutas';
import { aDatosClinicos, medicionesDe, type AtencionForm } from '../schemas/atencion';
import { exigir, puede } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';
import { codigoEvaluacion } from './evaluacionService';

export interface MedicionRegistro {
  inicioMs: number; // inicio del ingreso de datos (no incluye la medición clínica)
  busquedaS: number | null;
  erroresValidacion: number;
  conectividad: Conectividad;
}

export interface ResultadoRegistro {
  atencionId: string;
  codigoEvaluacion: string;
  duracionS: number;
}

/**
 * Registra una atención y su fila de evaluación académica en una única transacción.
 * La confirmación al usuario solo se muestra si esta función resuelve (escritura exitosa).
 * Si hay valores atípicos, exige que el operador haya confirmado su revisión; se marcan para revisión médica.
 */
export async function registrar(
  db: Db,
  actor: Actor,
  p: { pacienteId: string; campanaId: string; form: AtencionForm; atipicosConfirmados: boolean; medicion: MedicionRegistro },
): Promise<ResultadoRegistro> {
  exigir(actor.rol, 'atencion.crear');
  const m = medicionesDe(p.form);
  const imc = calcularImc(m.peso, m.talla_cm);
  const atipicos = detectarAtipicos(m, imc);
  if (atipicos.length > 0 && !p.atipicosConfirmados) {
    throw new ErrorNegocio('Hay valores atípicos sin confirmar. Revíselos antes de guardar.');
  }
  const datos = aDatosClinicos(p.form, atipicos.length > 0);
  const id = uuid();
  const codigo = codigoEvaluacion();
  const fin = now();
  const duracionS = Math.max(0, (fin - p.medicion.inicioMs) / 1000);
  try {
    await db.transaction(async (tx) => {
      const pac = await pacientes.porId(tx, p.pacienteId);
      if (!pac || pac.anulado_at) throw new ErrorNegocio('El paciente no existe o fue anulado.');
      const camp = await campanas.porId(tx, p.campanaId);
      if (!camp) throw new ErrorNegocio('La campaña no existe.');
      if (camp.estado !== 'ACTIVA') throw new ErrorNegocio('La campaña no está activa. Actívela antes de registrar atenciones.');
      await repo.insertar(tx, { id, pacienteId: p.pacienteId, campanaId: p.campanaId, usuarioId: actor.id, fecha: fin, ts: fin }, datos);
      await evalRepo.insertar(tx, {
        id: uuid(), codigo, atencion_id: id, campana_id: p.campanaId, metodo: 'DIGITAL', operador: actor.codigo_operador,
        inicio: p.medicion.inicioMs, fin, duracion_s: Math.round(duracionS * 10) / 10,
        tiempo_busqueda_s: p.medicion.busquedaS != null ? Math.round(p.medicion.busquedaS * 10) / 10 : null,
        errores_validacion: p.medicion.erroresValidacion, errores_verificados: null, incompletos: contarFaltantes(m),
        correcciones: 0, conectividad: p.medicion.conectividad, guardado_exitoso: 1, creado_at: fin,
      });
      // Marca de actividad de brigada en el recorrido abierto: solo la hora, sin paciente ni atención vinculados.
      const ruta = await rutasRepo.abierta(tx);
      if (ruta && ruta.estado === 'EN_CURSO') await rutasRepo.evento(tx, ruta.id, 'ATENCION', null, fin);
      await auditar(tx, {
        usuarioId: actor.id, entidad: 'atenciones', entidadId: id, accion: 'CREAR',
        detalle: atipicos.length ? `requiere revisión (${atipicos.length} valores atípicos)` : null,
      });
    });
  } catch (e) {
    // Se documenta el intento fallido para la evaluación (sin datos clínicos), sin ocultar el error original.
    await registrarIntentoFallido(db, actor, p.campanaId, p.medicion, codigo).catch(() => undefined);
    throw e;
  }
  return { atencionId: id, codigoEvaluacion: codigo, duracionS };
}

async function registrarIntentoFallido(db: Db, actor: Actor, campanaId: string, m: MedicionRegistro, codigo: string) {
  const camp = await campanas.porId(db, campanaId);
  if (!camp) return;
  const fin = now();
  await evalRepo.insertar(db, {
    id: uuid(), codigo: `${codigo}-F`, atencion_id: null, campana_id: campanaId, metodo: 'DIGITAL', operador: actor.codigo_operador,
    inicio: m.inicioMs, fin, duracion_s: Math.round(((fin - m.inicioMs) / 1000) * 10) / 10, tiempo_busqueda_s: m.busquedaS,
    errores_validacion: m.erroresValidacion, errores_verificados: null, incompletos: 0, correcciones: 0,
    conectividad: m.conectividad, guardado_exitoso: 0, creado_at: fin,
  });
}

/** Personal médico ve/corrige cualquier atención; un operador solo las que él registró. */
function exigirAccesoAtencion(actor: Actor, a: { usuario_id: string }, permiso: 'atencion.ver' | 'atencion.corregir') {
  if (puede(actor.rol, permiso)) return;
  if (puede(actor.rol, 'atencion.corregir_propia') && a.usuario_id === actor.id) return;
  exigir(actor.rol, permiso);
}

export async function obtener(db: Db, actor: Actor, id: string): Promise<AtencionConPaciente> {
  const a = await repo.porId(db, id);
  if (!a) throw new ErrorNegocio('Atención no encontrada.');
  exigirAccesoAtencion(actor, a, 'atencion.ver');
  return a;
}

/** Corrección con auditoría: guarda la versión previa completa y registra qué campos cambiaron. */
export async function corregir(
  db: Db,
  actor: Actor,
  p: { id: string; form: AtencionForm; versionEsperada: number; motivo: string; atipicosConfirmados: boolean },
): Promise<void> {
  if (!puede(actor.rol, 'atencion.corregir')) exigir(actor.rol, 'atencion.corregir_propia');
  if (p.motivo.trim().length < 5) throw new ErrorNegocio('Indique el motivo de la corrección (mínimo 5 caracteres).');
  const m = medicionesDe(p.form);
  const atipicos = detectarAtipicos(m, calcularImc(m.peso, m.talla_cm));
  if (atipicos.length > 0 && !p.atipicosConfirmados) throw new ErrorNegocio('Confirme los valores atípicos antes de guardar.');
  const nuevos = aDatosClinicos(p.form, atipicos.length > 0);
  const ts = now();
  await db.transaction(async (tx) => {
    const previa = await repo.crudaPorId(tx, p.id);
    if (!previa || previa.anulado_at) throw new ErrorNegocio('La atención no existe o fue anulada.');
    exigirAccesoAtencion(actor, previa, 'atencion.corregir');
    if (previa.version !== p.versionEsperada) throw new ErrorNegocio('La atención fue modificada por otra operación. Vuelva a abrirla.');
    const cambios = CAMPOS_CLINICOS.filter((k) => {
      const antes = (previa as unknown as Record<string, unknown>)[k];
      const despues = typeof nuevos[k] === 'boolean' ? (nuevos[k] ? 1 : 0) : nuevos[k];
      return (antes ?? null) !== (despues ?? null);
    });
    if (cambios.length === 0) throw new ErrorNegocio('No hay cambios que guardar.');
    await repo.guardarVersion(tx, { id: uuid(), atencionId: p.id, version: previa.version, datos: JSON.stringify(previa), usuarioId: actor.id, motivo: p.motivo.trim(), ts });
    const n = await repo.actualizarClinicos(tx, p.id, nuevos, p.versionEsperada, ts);
    if (n !== 1) throw new ErrorNegocio('No se pudo aplicar la corrección.');
    await evalRepo.sumarCorreccion(tx, p.id);
    await auditar(tx, { usuarioId: actor.id, entidad: 'atenciones', entidadId: p.id, accion: 'CORREGIR', detalle: `campos: ${cambios.join(', ')}` });
  });
}

export async function marcarRevisada(db: Db, actor: Actor, id: string): Promise<void> {
  exigir(actor.rol, 'atencion.revisar');
  await db.transaction(async (tx) => {
    const n = await repo.marcarRevisada(tx, id, actor.id, now());
    if (n !== 1) throw new ErrorNegocio('La atención no está pendiente de revisión.');
    await auditar(tx, { usuarioId: actor.id, entidad: 'atenciones', entidadId: id, accion: 'REVISAR' });
  });
}

export async function anular(db: Db, actor: Actor, id: string, motivo: string): Promise<void> {
  exigir(actor.rol, 'atencion.anular');
  if (motivo.trim().length < 5) throw new ErrorNegocio('Indique el motivo de la anulación (mínimo 5 caracteres).');
  await db.transaction(async (tx) => {
    const n = await repo.anular(tx, id, actor.id, motivo.trim(), now());
    if (n !== 1) throw new ErrorNegocio('La atención ya estaba anulada o no existe.');
    await auditar(tx, { usuarioId: actor.id, entidad: 'atenciones', entidadId: id, accion: 'ANULAR' });
  });
}

export async function historial(db: Db, actor: Actor, f: repo.FiltroHistorial) {
  exigir(actor.rol, 'historial.ver');
  return repo.historial(db, f);
}

export async function dePaciente(db: Db, actor: Actor, pacienteId: string) {
  exigir(actor.rol, 'paciente.ver_ficha');
  return repo.dePaciente(db, pacienteId);
}

export async function versiones(db: Db, actor: Actor, id: string) {
  const a = await repo.crudaPorId(db, id);
  if (!a) throw new ErrorNegocio('Atención no encontrada.');
  exigirAccesoAtencion(actor, a, 'atencion.ver');
  return repo.versiones(db, id);
}
