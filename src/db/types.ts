export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Abstracción mínima de base de datos usada por repositorios y servicios.
 * Implementaciones: ExpoDb (SQLCipher en el dispositivo) y SqlJsDb (pruebas en Node).
 * Toda consulta es parametrizada; nunca se concatenan valores del usuario en SQL.
 */
export interface Db {
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  /** Ejecuta `fn` en una transacción serializada (BEGIN IMMEDIATE … COMMIT / ROLLBACK). */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Cola asíncrona: garantiza que solo una operación use la conexión a la vez. */
export class Mutex {
  private cola: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const res = this.cola.then(fn, fn);
    this.cola = res.catch(() => undefined);
    return res;
  }
}

/** Operaciones crudas de un motor concreto. */
export interface MotorSql {
  run(sql: string, params: SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
}

/**
 * Implementación común: serializa el acceso con un Mutex y gestiona transacciones manuales en la MISMA conexión
 * (necesario con SQLCipher: withExclusiveTransactionAsync abre otra conexión sin la clave ni foreign_keys).
 */
export class DbSerializada implements Db {
  constructor(
    private readonly motor: MotorSql,
    private readonly mutex: Mutex = new Mutex(),
    private readonly enTx = false,
  ) {}

  private guard<T>(f: () => Promise<T>): Promise<T> {
    return this.enTx ? f() : this.mutex.run(f);
  }

  run(sql: string, params: SqlValue[] = []) {
    return this.guard(() => this.motor.run(sql, params));
  }
  all<T>(sql: string, params: SqlValue[] = []) {
    return this.guard(() => this.motor.all<T>(sql, params));
  }
  get<T>(sql: string, params: SqlValue[] = []) {
    return this.guard(() => this.motor.get<T>(sql, params));
  }
  exec(sql: string) {
    return this.guard(() => this.motor.exec(sql));
  }

  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.enTx) return fn(this); // transacción anidada: se une a la actual
    return this.mutex.run(async () => {
      await this.motor.exec('BEGIN IMMEDIATE');
      try {
        const r = await fn(new DbSerializada(this.motor, this.mutex, true));
        await this.motor.exec('COMMIT');
        return r;
      } catch (e) {
        try {
          await this.motor.exec('ROLLBACK');
        } catch {
          // la transacción ya pudo haber sido revertida por el motor
        }
        throw e;
      }
    });
  }
}
