import type { Db } from '../db/types';
import type { Campana } from '../domain/types';
import { now, uuid } from '../platform/runtime';
import { guardarAjuste, leerAjuste } from '../repositories/ajustes';
import { auditar } from '../repositories/auditoria';
import * as repo from '../repositories/campanas';
import type { CampanaForm } from '../schemas/otros';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

function aDatos(f: CampanaForm): repo.DatosCampana {
  return {
    nombre: f.nombre.trim(),
    sector: f.sector.trim(),
    inicio: f.inicio,
    fin: f.fin || null,
    descripcion: f.descripcion.trim() || null,
    responsable: f.responsable.trim(),
    estado: f.estado,
  };
}

export function listar(db: Db, incluirArchivadas = false) {
  return repo.listar(db, incluirArchivadas);
}

export function obtener(db: Db, id: string) {
  return repo.porId(db, id);
}

export async function crear(db: Db, actor: Actor, f: CampanaForm): Promise<string> {
  exigir(actor.rol, 'campana.gestionar');
  const id = uuid();
  await db.transaction(async (tx) => {
    await repo.insertar(tx, id, aDatos(f), actor.id, now());
    await auditar(tx, { usuarioId: actor.id, entidad: 'campanas', entidadId: id, accion: 'CREAR' });
    if (f.estado === 'ACTIVA') await guardarAjuste(tx, 'campana_activa_id', id);
  });
  return id;
}

export async function actualizar(db: Db, actor: Actor, id: string, f: CampanaForm): Promise<void> {
  exigir(actor.rol, 'campana.gestionar');
  await db.transaction(async (tx) => {
    const previa = await repo.porId(tx, id);
    if (!previa) throw new ErrorNegocio('Campaña no encontrada.');
    await repo.actualizar(tx, id, aDatos(f), now());
    await auditar(tx, { usuarioId: actor.id, entidad: 'campanas', entidadId: id, accion: 'ACTUALIZAR', detalle: `estado ${previa.estado} → ${f.estado}` });
    const activa = await leerAjuste(tx, 'campana_activa_id');
    if (f.estado === 'ACTIVA') await guardarAjuste(tx, 'campana_activa_id', id);
    else if (activa === id) await guardarAjuste(tx, 'campana_activa_id', '');
  });
}

/** Selecciona la campaña de trabajo del dispositivo. Debe estar ACTIVA. */
export async function seleccionarActiva(db: Db, actor: Actor, id: string): Promise<void> {
  exigir(actor.rol, 'campana.seleccionar');
  const c = await repo.porId(db, id);
  if (!c) throw new ErrorNegocio('Campaña no encontrada.');
  if (c.estado !== 'ACTIVA') throw new ErrorNegocio('Solo puede seleccionarse una campaña en estado ACTIVA.');
  await guardarAjuste(db, 'campana_activa_id', id);
  await auditar(db, { usuarioId: actor.id, entidad: 'campanas', entidadId: id, accion: 'AJUSTE', detalle: 'campaña de trabajo seleccionada' });
}

export async function activa(db: Db): Promise<Campana | null> {
  const id = await leerAjuste(db, 'campana_activa_id');
  if (!id) return null;
  const c = await repo.porId(db, id);
  return c && c.estado === 'ACTIVA' ? c : null;
}
