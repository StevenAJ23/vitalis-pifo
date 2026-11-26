import type { Db } from '../db/types';
import { evaluarDuplicados, type PosibleDuplicado } from '../domain/duplicates';
import { codigoZona } from '../domain/text';
import type { Paciente } from '../domain/types';
import { now, uuid } from '../platform/runtime';
import { auditar } from '../repositories/auditoria';
import { leerAjuste, siguienteSecuencia } from '../repositories/ajustes';
import * as repo from '../repositories/pacientes';
import { aDatosPaciente, type PacienteForm } from '../schemas/paciente';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

export type CandidatoDuplicado = PosibleDuplicado<Paciente & { cedula: string | null }>;

/**
 * Código interno legible: P-<ZONA>-<número> (p. ej. P-TOGL-0007), con numeración por zona.
 * Si el código ya existiera (p. ej. tras fusionar respaldos de otro teléfono) se usa el siguiente número libre.
 */
async function generarCodigo(db: Db, sector: string): Promise<string> {
  const zona = codigoZona(sector);
  for (let intento = 0; intento < 1000; intento++) {
    const n = await siguienteSecuencia(db, `paciente_${zona}`);
    const codigo = `P-${zona}-${String(n).padStart(4, '0')}`;
    const existe = await db.get<{ id: string }>('SELECT id FROM pacientes WHERE codigo = ?', [codigo]);
    if (!existe) return codigo;
  }
  throw new ErrorNegocio('No se pudo generar el código del paciente.');
}

export async function buscar(db: Db, actor: Actor, consulta: string): Promise<Paciente[]> {
  exigir(actor.rol, 'paciente.buscar');
  return repo.buscar(db, consulta);
}

export async function posiblesDuplicados(db: Db, actor: Actor, f: PacienteForm, excluirId?: string): Promise<CandidatoDuplicado[]> {
  exigir(actor.rol, 'paciente.buscar');
  const cedula = f.cedula || null;
  const telefono = f.telefono || null;
  const candidatos = await repo.candidatosDuplicado(db, { apellidos: f.apellidos, telefono, cedula });
  const conCedula = candidatos.map((c) => ({ ...c, cedula: c.campos_opcionales.cedula ?? null }));
  return evaluarDuplicados(
    { id: excluirId, nombres: f.nombres, apellidos: f.apellidos, edad: f.edad ? Number(f.edad) : null, sector: f.sector, telefono, cedula },
    conCedula,
  );
}

/** Crea el paciente y, si corresponde, su consentimiento de contacto, en una sola transacción. */
export async function crear(db: Db, actor: Actor, f: PacienteForm): Promise<Paciente> {
  exigir(actor.rol, 'paciente.crear');
  const opcionales = (await leerAjuste(db, 'campos_opcionales')) === '1';
  const versionAviso = await leerAjuste(db, 'aviso_version');
  const ts = now();
  const datos = aDatosPaciente(f, opcionales, ts);
  const id = uuid();
  await db.transaction(async (tx) => {
    const codigo = await generarCodigo(tx, datos.sector);
    await repo.insertar(tx, id, codigo, datos, actor.id, ts);
    if (f.consentimiento_contacto) {
      await repo.registrarConsentimiento(tx, { id: uuid(), pacienteId: id, canal: datos.canal_preferido, otorgado: true, versionAviso, usuarioId: actor.id, ts });
    }
    await auditar(tx, { usuarioId: actor.id, entidad: 'pacientes', entidadId: id, accion: 'CREAR', detalle: f.consentimiento_contacto ? 'con consentimiento de contacto' : null });
  });
  const p = await repo.porId(db, id);
  if (!p) throw new ErrorNegocio('No se pudo confirmar el guardado del paciente.');
  return p;
}

export async function actualizar(db: Db, actor: Actor, id: string, f: PacienteForm): Promise<void> {
  exigir(actor.rol, 'paciente.editar');
  const opcionales = (await leerAjuste(db, 'campos_opcionales')) === '1';
  const versionAviso = await leerAjuste(db, 'aviso_version');
  const ts = now();
  await db.transaction(async (tx) => {
    const previo = await repo.porId(tx, id);
    if (!previo || previo.anulado_at) throw new ErrorNegocio('El paciente no existe o fue anulado.');
    const datos = aDatosPaciente(f, opcionales, ts);
    if (!opcionales) datos.campos_opcionales = previo.campos_opcionales; // no borrar lo ya autorizado
    const cambios = (['nombres', 'apellidos', 'edad', 'sector', 'telefono', 'canal_preferido'] as const).filter(
      (k) => (previo[k] ?? null) !== (datos[k] ?? null),
    );
    if (JSON.stringify(previo.campos_opcionales) !== JSON.stringify(datos.campos_opcionales)) cambios.push('campos_opcionales' as never);
    await repo.actualizar(tx, id, datos, ts);
    if (previo.consentimiento_contacto !== f.consentimiento_contacto || (f.consentimiento_contacto && previo.canal_preferido !== datos.canal_preferido)) {
      await repo.registrarConsentimiento(tx, { id: uuid(), pacienteId: id, canal: datos.canal_preferido, otorgado: f.consentimiento_contacto, versionAviso, usuarioId: actor.id, ts });
      cambios.push('consentimiento' as never);
    }
    await auditar(tx, { usuarioId: actor.id, entidad: 'pacientes', entidadId: id, accion: 'ACTUALIZAR', detalle: cambios.length ? `campos: ${cambios.join(', ')}` : 'sin cambios' });
  });
}

/** Ficha completa: solo roles autorizados; cada acceso queda auditado. */
export async function obtenerFicha(db: Db, actor: Actor, id: string): Promise<Paciente> {
  exigir(actor.rol, 'paciente.ver_ficha');
  const p = await repo.porId(db, id);
  if (!p) throw new ErrorNegocio('Paciente no encontrado.');
  await auditar(db, { usuarioId: actor.id, entidad: 'pacientes', entidadId: id, accion: 'VER_FICHA' });
  return p;
}

/** Datos mínimos para registrar una atención (sin ficha clínica). */
export async function obtenerResumen(db: Db, actor: Actor, id: string): Promise<Paciente> {
  exigir(actor.rol, 'atencion.crear');
  const p = await repo.porId(db, id);
  if (!p || p.anulado_at) throw new ErrorNegocio('Paciente no encontrado o anulado.');
  return p;
}

/** Anulación lógica (nunca borrado físico). */
export async function anular(db: Db, actor: Actor, id: string, motivo: string): Promise<void> {
  exigir(actor.rol, 'paciente.anular');
  if (motivo.trim().length < 5) throw new ErrorNegocio('Indique el motivo de la anulación (mínimo 5 caracteres).');
  await db.transaction(async (tx) => {
    await repo.anular(tx, id, actor.id, motivo.trim(), now());
    await auditar(tx, { usuarioId: actor.id, entidad: 'pacientes', entidadId: id, accion: 'ANULAR' });
  });
}
