import type { Db, SqlValue } from '../db/types';
import { TABLAS_DATOS, VERSION_ESQUEMA } from '../db/migrations';
import { now } from '../platform/runtime';
import { guardarAjuste, leerAjuste } from '../repositories/ajustes';
import { auditar } from '../repositories/auditoria';
import { cifrarRespaldo, descifrarRespaldo, parsearSobre, validarFraseRespaldo, type SobreCifrado } from '../security/backupCrypto';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

/** Tablas incluidas en el respaldo clínico + GPS. Las credenciales NUNCA se incluyen. */
const TABLAS_RESPALDO = ['usuarios', 'campanas', 'pacientes', 'consentimientos', 'atenciones', 'atenciones_versiones',
  'evaluacion', 'evaluacion_sesion', 'rutas', 'ruta_puntos', 'ruta_paradas', 'ruta_eventos', 'auditoria', 'secuencias'] as const;
type TablaRespaldo = (typeof TABLAS_RESPALDO)[number];

export interface ContenidoRespaldo {
  esquema: number;
  tablas: Partial<Record<TablaRespaldo, Record<string, SqlValue>[]>>;
}

export type ModoRestauracion = 'REEMPLAZAR' | 'FUSIONAR';

export async function volcar(db: Db): Promise<ContenidoRespaldo> {
  const tablas: ContenidoRespaldo['tablas'] = {};
  for (const t of TABLAS_RESPALDO) {
    const filas = await db.all<Record<string, SqlValue>>(`SELECT * FROM ${t}`);
    if (t === 'usuarios') {
      tablas[t] = filas.map(({ credencial_protegida: _c, biometria_hash: _b, ...resto }) => ({ ...resto, credencial_protegida: null, biometria_hash: null }));
    } else {
      tablas[t] = filas;
    }
  }
  return { esquema: VERSION_ESQUEMA, tablas };
}

export function conteos(c: ContenidoRespaldo): Record<string, number> {
  return Object.fromEntries(Object.entries(c.tablas).map(([k, v]) => [k, v?.length ?? 0]));
}

export async function crearRespaldo(db: Db, actor: Actor, frase: string): Promise<{ sobre: SobreCifrado; conteos: Record<string, number> }> {
  exigir(actor.rol, 'respaldo.gestionar');
  const err = validarFraseRespaldo(frase);
  if (err) throw new ErrorNegocio(err);
  const contenido = await volcar(db);
  const dispositivo = await leerAjuste(db, 'dispositivo_id');
  const sobre = await cifrarRespaldo(JSON.stringify(contenido), frase, { creado: now(), dispositivo, esquema: VERSION_ESQUEMA });
  await auditar(db, { usuarioId: actor.id, entidad: 'respaldo', accion: 'RESPALDO_CREAR', detalle: JSON.stringify(conteos(contenido)) });
  return { sobre, conteos: conteos(contenido) };
}

/** Descifra y valida el contenido (sin aplicarlo). */
export async function abrirRespaldo(texto: string, frase: string): Promise<{ sobre: SobreCifrado; contenido: ContenidoRespaldo }> {
  const sobre = parsearSobre(texto);
  if (sobre.esquema > VERSION_ESQUEMA) throw new ErrorNegocio('El respaldo proviene de una versión más reciente de la app.');
  const plano = await descifrarRespaldo(sobre, frase);
  let contenido: ContenidoRespaldo;
  try {
    contenido = JSON.parse(plano) as ContenidoRespaldo;
  } catch {
    throw new ErrorNegocio('El contenido del respaldo está dañado.');
  }
  if (!contenido || typeof contenido.tablas !== 'object') throw new ErrorNegocio('El contenido del respaldo está dañado.');
  for (const k of Object.keys(contenido.tablas)) {
    if (!(TABLAS_RESPALDO as readonly string[]).includes(k)) throw new ErrorNegocio(`Tabla desconocida en respaldo: ${k}`);
    if (!Array.isArray(contenido.tablas[k as TablaRespaldo])) throw new ErrorNegocio('Estructura de respaldo inválida.');
  }
  return { sobre, contenido };
}

/** Prueba de restauración: descifra y valida íntegramente; registra la verificación exitosa. */
export async function verificarRespaldo(db: Db, actor: Actor, texto: string, frase: string) {
  exigir(actor.rol, 'respaldo.gestionar');
  const { sobre, contenido } = await abrirRespaldo(texto, frase);
  await guardarAjuste(db, 'respaldo_verificado_at', String(now()));
  await auditar(db, { usuarioId: actor.id, entidad: 'respaldo', accion: 'RESPALDO_VERIFICAR' });
  return { creado: sobre.creado, dispositivo: sobre.dispositivo, conteos: conteos(contenido) };
}

async function columnasDe(db: Db, tabla: string): Promise<Set<string>> {
  const cols = await db.all<{ name: string }>(`PRAGMA table_info(${tabla})`);
  return new Set(cols.map((c) => c.name));
}

/**
 * Restaura en una transacción. REEMPLAZAR borra los datos de negocio actuales (los usuarios locales y sus
 * credenciales se conservan); FUSIONAR inserta solo UUID inexistentes (consolidación entre dispositivos).
 * Solo se insertan columnas existentes en el esquema actual (lista blanca vía PRAGMA table_info).
 */
export async function restaurar(db: Db, actor: Actor, texto: string, frase: string, modo: ModoRestauracion) {
  exigir(actor.rol, 'respaldo.gestionar');
  const { contenido } = await abrirRespaldo(texto, frase);
  const resultado: Record<string, number> = {};
  await db.transaction(async (tx) => {
    if (modo === 'REEMPLAZAR') {
      for (const t of TABLAS_DATOS) await tx.run(`DELETE FROM ${t}`);
      await tx.run('DELETE FROM secuencias');
    }
    for (const t of TABLAS_RESPALDO) {
      const filas = contenido.tablas[t] ?? [];
      if (filas.length === 0) continue;
      const permitidas = await columnasDe(tx, t);
      let n = 0;
      for (const fila of filas) {
        const cols = Object.keys(fila).filter((c) => permitidas.has(c));
        if (t === 'usuarios') {
          // Usuarios del respaldo sin credencial: inactivos hasta que un administrador restablezca su contraseña.
          fila.credencial_protegida = null;
          fila.biometria_hash = null;
          fila.activo = 0;
          const choque = await tx.get<{ id: string }>('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE AND id <> ?', [
            String(fila.usuario ?? ''), String(fila.id ?? ''),
          ]);
          if (choque) fila.usuario = `${String(fila.usuario)}-r${String(fila.id ?? '').slice(0, 4)}`;
        }
        if (cols.length === 0) continue;
        const verbo = t === 'secuencias' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
        const r = await tx.run(
          `${verbo} INTO ${t} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          cols.map((c) => fila[c] ?? null),
        );
        n += r.changes;
      }
      resultado[t] = n;
    }
    const fk = await tx.all<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (fk.length > 0) throw new ErrorNegocio('El respaldo tiene referencias inconsistentes; no se aplicó ningún cambio.');
    await auditar(tx, { usuarioId: actor.id, entidad: 'respaldo', accion: 'RESPALDO_RESTAURAR', detalle: `${modo} ${JSON.stringify(resultado)}` });
  });
  await guardarAjuste(db, 'respaldo_verificado_at', String(now()));
  return resultado;
}
