import type { Db, SqlValue } from '../db/types';
import { now } from '../platform/runtime';
import { leerAjuste } from '../repositories/ajustes';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from '../services/contexto';

/**
 * Preparación para la consolidación futura con una API REST + PostgreSQL (fuera del alcance del piloto offline).
 * - Cada entidad sincronizable tiene UUID y columna sync_estado ('PENDIENTE' | 'SINCRONIZADO').
 * - Un lote contiene las filas pendientes; el servidor debe responder 2xx con los ids aceptados.
 * - El envío NUNCA es automático: requiere URL HTTPS configurada y acción explícita de un administrador.
 * Contrato propuesto en docs/API_FUTURA.md.
 */
export const TABLAS_SYNC = ['campanas', 'pacientes', 'consentimientos', 'atenciones'] as const;
type TablaSync = (typeof TABLAS_SYNC)[number];

export interface LoteSync {
  dispositivo_id: string;
  generado: number;
  esquema: number;
  entidades: Record<TablaSync, Record<string, SqlValue>[]>;
}

export interface TransporteSync {
  enviar(lote: LoteSync): Promise<{ aceptados: Partial<Record<TablaSync, string[]>> }>;
}

export async function pendientes(db: Db): Promise<Record<TablaSync, number>> {
  const out = {} as Record<TablaSync, number>;
  for (const t of TABLAS_SYNC) {
    const r = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE sync_estado = 'PENDIENTE'`);
    out[t] = r?.n ?? 0;
  }
  return out;
}

export async function construirLote(db: Db, limitePorTabla = 200): Promise<LoteSync> {
  const entidades = {} as LoteSync['entidades'];
  for (const t of TABLAS_SYNC) {
    entidades[t] = await db.all<Record<string, SqlValue>>(`SELECT * FROM ${t} WHERE sync_estado = 'PENDIENTE' LIMIT ?`, [limitePorTabla]);
  }
  const ver = await db.get<{ user_version: number }>('PRAGMA user_version');
  return { dispositivo_id: await leerAjuste(db, 'dispositivo_id'), generado: now(), esquema: ver?.user_version ?? 0, entidades };
}

export async function marcarSincronizados(db: Db, aceptados: Partial<Record<TablaSync, string[]>>): Promise<number> {
  let n = 0;
  await db.transaction(async (tx) => {
    for (const t of TABLAS_SYNC) {
      for (const id of aceptados[t] ?? []) {
        n += (await tx.run(`UPDATE ${t} SET sync_estado = 'SINCRONIZADO' WHERE id = ?`, [id])).changes;
      }
    }
  });
  return n;
}

/** Transporte HTTP(S) con token Bearer. Solo acepta URLs https. */
export class TransporteRest implements TransporteSync {
  constructor(private readonly baseUrl: string, private readonly token: string) {
    if (!/^https:\/\/[^\s]+$/i.test(baseUrl)) throw new ErrorNegocio('La URL del servidor debe usar HTTPS.');
  }
  async enviar(lote: LoteSync) {
    const resp = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/sync/lotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(lote),
    });
    if (!resp.ok) throw new ErrorNegocio(`El servidor rechazó el lote (HTTP ${resp.status}).`);
    const cuerpo = (await resp.json()) as { aceptados?: Partial<Record<TablaSync, string[]>> };
    return { aceptados: cuerpo.aceptados ?? {} };
  }
}

export async function sincronizar(db: Db, actor: Actor, transporte: TransporteSync) {
  exigir(actor.rol, 'respaldo.gestionar');
  const lote = await construirLote(db);
  const total = TABLAS_SYNC.reduce((a, t) => a + lote.entidades[t].length, 0);
  if (total === 0) return { enviados: 0, confirmados: 0 };
  const { aceptados } = await transporte.enviar(lote);
  return { enviados: total, confirmados: await marcarSincronizados(db, aceptados) };
}
