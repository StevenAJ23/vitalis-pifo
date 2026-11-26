import * as SQLite from 'expo-sqlite';
import { DbSerializada, type Db, type MotorSql, type SqlValue } from './types';
import { migrar } from './migrations';
import { obtenerOCrearClaveBd } from '../security/keyStore';

export const NOMBRE_BD = 'vitalis_pifo.db';

export interface EstadoCifrado {
  sqlcipher: boolean;
  version: string | null;
}

class MotorExpo implements MotorSql {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}
  async run(sql: string, params: SqlValue[]) {
    const r = await this.db.runAsync(sql, params);
    return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
  }
  all<T>(sql: string, params: SqlValue[]) {
    return this.db.getAllAsync<T>(sql, params);
  }
  get<T>(sql: string, params: SqlValue[]) {
    return this.db.getFirstAsync<T>(sql, params);
  }
  exec(sql: string) {
    return this.db.execAsync(sql);
  }
}

let instancia: Promise<{ db: Db; cifrado: EstadoCifrado; nativa: SQLite.SQLiteDatabase }> | null = null;

/**
 * Abre (una sola vez por proceso JS) la base cifrada con SQLCipher.
 * La clave (256 bits aleatorios) vive solo en SecureStore (Android Keystore / iOS Keychain).
 * Si el binario no incluye SQLCipher, `PRAGMA key` no tiene efecto: se detecta con `PRAGMA cipher_version`
 * y se informa en la pantalla de seguridad, impidiendo habilitar el modo de datos reales.
 */
export function abrirBaseDatos() {
  if (!instancia) {
    instancia = (async () => {
      const clave = await obtenerOCrearClaveBd();
      const nativa = await SQLite.openDatabaseAsync(NOMBRE_BD);
      // La clave es hex validado (64 caracteres [0-9a-f]); se usa como clave cruda para evitar KDF adicional.
      await nativa.execAsync(`PRAGMA key = "x'${clave}'";`);
      const cv = await nativa.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
      // Si la clave no corresponde, la primera lectura real falla ("file is not a database").
      await nativa.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
      await nativa.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;');
      const db = new DbSerializada(new MotorExpo(nativa));
      await migrar(db);
      return { db, nativa, cifrado: { sqlcipher: !!cv?.cipher_version, version: cv?.cipher_version ?? null } };
    })();
    instancia.catch(() => {
      instancia = null;
    });
  }
  return instancia;
}

export async function obtenerDb(): Promise<Db> {
  return (await abrirBaseDatos()).db;
}

/** Elimina por completo la base local (solo desde el flujo de recuperación con confirmación explícita). */
export async function eliminarBaseDatos(): Promise<void> {
  if (instancia) {
    try {
      const { nativa } = await instancia;
      await nativa.closeAsync();
    } catch {
      // si no llegó a abrirse no hay nada que cerrar
    }
    instancia = null;
  }
  await SQLite.deleteDatabaseAsync(NOMBRE_BD);
}
