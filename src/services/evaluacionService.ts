import type { Db } from '../db/types';
import { media, mediana, porcentaje } from '../domain/stats';
import type { Evaluacion, Metodo } from '../domain/types';
import { now, randomBytes, uuid } from '../platform/runtime';
import * as repo from '../repositories/evaluacion';
import type { EvaluacionManualForm, SesionForm } from '../schemas/otros';
import { exigir } from '../security/permissions';
import { ErrorNegocio, type Actor } from './contexto';

const ALFABETO = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // sin caracteres ambiguos

/** Código aleatorio de registro académico, desvinculado de pacientes (p. ej. "E-7KQ2MX"). */
export function codigoEvaluacion(): string {
  const b = randomBytes(6);
  return 'E-' + Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('');
}

const num = (v: string) => Number(v.replace(',', '.'));

export async function registrarManual(db: Db, actor: Actor, campanaId: string, f: EvaluacionManualForm, inicio?: number): Promise<string> {
  exigir(actor.rol, 'evaluacion.gestionar');
  if (!campanaId) throw new ErrorNegocio('Seleccione una campaña activa.');
  const duracion = num(f.duracion_s);
  const fin = now();
  const id = uuid();
  await repo.insertar(db, {
    id, codigo: codigoEvaluacion(), atencion_id: null, campana_id: campanaId, metodo: f.metodo, operador: f.operador.toUpperCase(),
    inicio: inicio ?? Math.round(fin - duracion * 1000), fin, duracion_s: Math.round(duracion * 10) / 10,
    tiempo_busqueda_s: f.tiempo_busqueda_s ? num(f.tiempo_busqueda_s) : null, errores_validacion: 0,
    errores_verificados: f.errores_verificados === '' ? null : Number(f.errores_verificados),
    incompletos: Number(f.incompletos), correcciones: Number(f.correcciones), conectividad: f.conectividad,
    guardado_exitoso: f.guardado_exitoso ? 1 : 0, creado_at: fin,
  });
  return id;
}

/** Errores comprobados contra la ficha fuente (se contabilizan aparte de los errores de validación). */
export async function fijarErroresVerificados(db: Db, actor: Actor, id: string, errores: number): Promise<void> {
  exigir(actor.rol, 'evaluacion.gestionar');
  if (!Number.isInteger(errores) || errores < 0 || errores > 50) throw new ErrorNegocio('Ingrese un entero entre 0 y 50.');
  if ((await repo.fijarErroresVerificados(db, id, errores)) !== 1) throw new ErrorNegocio('Registro no encontrado.');
}

export async function eliminarManual(db: Db, actor: Actor, id: string): Promise<void> {
  exigir(actor.rol, 'evaluacion.gestionar');
  if ((await repo.eliminarManual(db, id)) !== 1) throw new ErrorNegocio('Solo pueden retirarse registros manuales (papel/Excel).');
}

export async function registrarSesion(db: Db, actor: Actor, campanaId: string, f: SesionForm): Promise<void> {
  exigir(actor.rol, 'evaluacion.gestionar');
  if (!campanaId) throw new ErrorNegocio('Seleccione una campaña activa.');
  await repo.insertarSesion(db, {
    id: uuid(), campana_id: campanaId, operador: f.operador.toUpperCase(), metodo: f.metodo, satisfaccion: f.satisfaccion,
    tiempo_consolidacion_s: f.tiempo_consolidacion_min ? Math.round(num(f.tiempo_consolidacion_min) * 60) : null,
    hojas_papel: f.hojas_papel === '' ? null : Number(f.hojas_papel), notas: f.notas || null, fecha: now(),
  });
}

export interface ResumenMetodo {
  metodo: Metodo;
  n: number;
  exitosos: number;
  tasaExito: number | null;
  tiempoMedio: number | null;
  tiempoMediana: number | null;
  busquedaMedia: number | null;
  erroresValidacion: number;
  erroresVerificados: number;
  verificados: number;
  erroresPorRegistro: number | null;
  faltantesMedia: number | null;
  correcciones: number;
  sinConexion: number;
  satisfaccionMedia: number | null;
  consolidacionMediaS: number | null;
}

export function resumirPorMetodo(
  filas: Evaluacion[],
  sesiones: { metodo: Metodo; satisfaccion: number; tiempo_consolidacion_s: number | null }[],
): ResumenMetodo[] {
  return (['DIGITAL', 'PAPEL', 'EXCEL'] as Metodo[]).map((metodo) => {
    const f = filas.filter((x) => x.metodo === metodo);
    const ok = f.filter((x) => x.guardado_exitoso === 1);
    const verif = f.filter((x) => x.errores_verificados != null);
    const s = sesiones.filter((x) => x.metodo === metodo);
    const totalVerif = verif.reduce((a, x) => a + (x.errores_verificados ?? 0), 0);
    return {
      metodo,
      n: f.length,
      exitosos: ok.length,
      tasaExito: porcentaje(ok.length, f.length),
      tiempoMedio: media(ok.map((x) => x.duracion_s)),
      tiempoMediana: mediana(ok.map((x) => x.duracion_s)),
      busquedaMedia: media(f.filter((x) => x.tiempo_busqueda_s != null).map((x) => x.tiempo_busqueda_s as number)),
      erroresValidacion: f.reduce((a, x) => a + x.errores_validacion, 0),
      erroresVerificados: totalVerif,
      verificados: verif.length,
      erroresPorRegistro: verif.length ? totalVerif / verif.length : null,
      faltantesMedia: media(ok.map((x) => x.incompletos)),
      correcciones: f.reduce((a, x) => a + x.correcciones, 0),
      sinConexion: f.filter((x) => x.conectividad === 'SIN_CONEXION').length,
      satisfaccionMedia: media(s.map((x) => x.satisfaccion)),
      consolidacionMediaS: media(s.filter((x) => x.tiempo_consolidacion_s != null).map((x) => x.tiempo_consolidacion_s as number)),
    };
  });
}

export async function resumen(db: Db, actor: Actor, campanaId: string | null) {
  exigir(actor.rol, 'estadisticas.ver');
  const [filas, ses] = await Promise.all([repo.listar(db, campanaId), repo.sesiones(db, campanaId)]);
  return { filas, sesiones: ses, porMetodo: resumirPorMetodo(filas, ses) };
}
