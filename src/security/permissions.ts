import type { Rol } from '../domain/types';

export type Permiso =
  | 'paciente.crear'
  | 'paciente.buscar'
  | 'paciente.ver_ficha'
  | 'paciente.editar'
  | 'paciente.anular'
  | 'atencion.crear'
  | 'atencion.ver'
  | 'atencion.corregir'
  | 'atencion.corregir_propia'
  | 'atencion.revisar'
  | 'atencion.anular'
  | 'historial.ver'
  | 'campana.gestionar'
  | 'campana.seleccionar'
  | 'ruta.capturar'
  | 'ruta.ver'
  | 'estadisticas.ver'
  | 'estadisticas.clinicas'
  | 'evaluacion.gestionar'
  | 'exportar.metricas'
  | 'exportar.geojson'
  | 'respaldo.gestionar'
  | 'usuarios.gestionar'
  | 'auditoria.ver'
  | 'seguridad.gestionar'
  | 'datos.sinteticos';

const TODOS: Permiso[] = [
  'paciente.crear', 'paciente.buscar', 'paciente.ver_ficha', 'paciente.editar', 'paciente.anular',
  'atencion.crear', 'atencion.ver', 'atencion.corregir', 'atencion.corregir_propia', 'atencion.revisar', 'atencion.anular',
  'historial.ver', 'campana.gestionar', 'campana.seleccionar', 'ruta.capturar', 'ruta.ver',
  'estadisticas.ver', 'estadisticas.clinicas', 'evaluacion.gestionar', 'exportar.metricas', 'exportar.geojson',
  'respaldo.gestionar', 'usuarios.gestionar', 'auditoria.ver', 'seguridad.gestionar', 'datos.sinteticos',
];

/**
 * Matriz de control de acceso por rol (mínimo privilegio):
 * - ADMIN: administración completa del dispositivo.
 * - MEDICO: registro clínico completo, fichas, correcciones y revisión de valores atípicos.
 * - OPERADOR: registro rápido en campo (crear/buscar pacientes, registrar atenciones, capturar ruta). Sin fichas.
 * - ANALISTA: solo métricas académicas desidentificadas y evaluación del piloto. Sin datos clínicos.
 */
export const MATRIZ_ROLES: Record<Rol, ReadonlySet<Permiso>> = {
  ADMIN: new Set(TODOS),
  MEDICO: new Set<Permiso>([
    'paciente.crear', 'paciente.buscar', 'paciente.ver_ficha', 'paciente.editar', 'paciente.anular',
    'atencion.crear', 'atencion.ver', 'atencion.corregir', 'atencion.revisar', 'atencion.anular',
    'historial.ver', 'campana.seleccionar', 'ruta.capturar', 'ruta.ver',
    'estadisticas.ver', 'estadisticas.clinicas', 'evaluacion.gestionar', 'exportar.metricas', 'exportar.geojson',
  ]),
  OPERADOR: new Set<Permiso>([
    'paciente.crear', 'paciente.buscar', 'atencion.crear', 'atencion.corregir_propia', 'campana.seleccionar',
    'ruta.capturar', 'ruta.ver', 'estadisticas.ver', 'evaluacion.gestionar',
  ]),
  ANALISTA: new Set<Permiso>(['estadisticas.ver', 'evaluacion.gestionar', 'exportar.metricas']),
};

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  MEDICO: 'Personal médico',
  OPERADOR: 'Operador de registro',
  ANALISTA: 'Analista académico',
};

export function puede(rol: Rol | null | undefined, permiso: Permiso): boolean {
  if (!rol) return false;
  return MATRIZ_ROLES[rol]?.has(permiso) ?? false;
}

export class AccesoDenegadoError extends Error {
  constructor(permiso: Permiso) {
    super(`Acceso denegado: su rol no permite esta acción (${permiso}).`);
    this.name = 'AccesoDenegadoError';
  }
}

export function exigir(rol: Rol | null | undefined, permiso: Permiso): void {
  if (!puede(rol, permiso)) throw new AccesoDenegadoError(permiso);
}
