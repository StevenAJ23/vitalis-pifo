import initSqlJs, { type Database } from 'sql.js';
import path from 'node:path';
import { DbSerializada, type Db, type MotorSql, type SqlValue } from '../../src/db/types';
import { migrar } from '../../src/db/migrations';
import { guardarAjuste } from '../../src/repositories/ajustes';
import { crearAdminInicial, aActor } from '../../src/services/authService';
import type { Actor } from '../../src/services/contexto';

class MotorSqlJs implements MotorSql {
  constructor(readonly db: Database) {}
  async run(sql: string, params: SqlValue[]) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const id = this.db.exec('SELECT last_insert_rowid() AS id');
    return { changes, lastInsertRowId: Number(id[0]?.values[0]?.[0] ?? 0) };
  }
  async all<T>(sql: string, params: SqlValue[]) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      return out;
    } finally {
      st.free();
    }
  }
  async get<T>(sql: string, params: SqlValue[]) {
    return (await this.all<T>(sql, params))[0] ?? null;
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Base SQLite real en memoria con el mismo esquema/migraciones de la app. */
export async function crearDbPrueba(): Promise<{ db: Db; motor: MotorSqlJs; exportar: () => Uint8Array }> {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f) });
  }
  const nativa = new SQL.Database();
  nativa.exec('PRAGMA foreign_keys = ON');
  const motor = new MotorSqlJs(nativa);
  const db = new DbSerializada(motor);
  await migrar(db);
  await guardarAjuste(db, 'dispositivo_id', 'abcd1234-0000-4000-8000-000000000000');
  return { db, motor, exportar: () => nativa.export() };
}

/** Reabre una base a partir de su volcado binario (simula cerrar y reabrir la app). */
export async function reabrir(bytes: Uint8Array): Promise<Db> {
  const nativa = new SQL!.Database(bytes);
  nativa.exec('PRAGMA foreign_keys = ON');
  const db = new DbSerializada(new MotorSqlJs(nativa));
  await migrar(db);
  return db;
}

export async function conAdmin(db: Db): Promise<Actor> {
  const u = await crearAdminInicial(db, { nombre: 'Admin Prueba', usuario: 'admin', clave: 'Clave1234' });
  return aActor(u);
}
