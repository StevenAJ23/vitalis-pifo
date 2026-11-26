import type { ModoTraslado } from './gpsFilter';

export type Rol = 'ADMIN' | 'MEDICO' | 'OPERADOR' | 'ANALISTA';
export type SyncEstado = 'PENDIENTE' | 'SINCRONIZADO';

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  codigo_operador: string;
  activo: number;
  intentos_fallidos: number;
  bloqueado_hasta: number | null;
  debe_cambiar_clave: number;
  tiene_credencial: number;
  creado_at: number;
  actualizado_at: number;
}

export type EstadoCampana = 'PLANIFICADA' | 'ACTIVA' | 'CERRADA' | 'ARCHIVADA';

export interface Campana {
  id: string;
  nombre: string;
  sector: string;
  inicio: string;
  fin: string | null;
  descripcion: string | null;
  responsable: string;
  estado: EstadoCampana;
  creado_por: string;
  creado_at: number;
  actualizado_at: number;
}

export type Sexo = 'F' | 'M' | 'OTRO';
export type Canal = 'WHATSAPP' | 'SMS' | 'NINGUNO';

export interface CamposOpcionales {
  cedula?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: Sexo | null;
}

export interface Paciente {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  edad: number | null;
  sector: string;
  telefono: string | null;
  campos_opcionales: CamposOpcionales;
  canal_preferido: Canal;
  consentimiento_contacto: boolean;
  creado_por: string;
  creado_at: number;
  actualizado_at: number;
  anulado_at: number | null;
  version: number;
  /** Resumen para listados (solo lectura). */
  n_atenciones?: number;
  ultima_atencion?: number | null;
}

export type Oido = 'SI' | 'NO' | 'NO_EVALUADO';

export interface Atencion {
  id: string;
  paciente_id: string;
  campana_id: string;
  usuario_id: string;
  fecha: number;
  sistolica: number | null;
  diastolica: number | null;
  frecuencia: number | null;
  temperatura: number | null;
  spo2: number | null;
  peso: number | null;
  talla_cm: number | null;
  imc: number | null;
  oido_i: Oido;
  oido_d: Oido;
  observaciones: string | null;
  seguimiento: number;
  cita_at: string | null;
  requiere_revision: number;
  revisado_por: string | null;
  revisado_at: number | null;
  version: number;
  anulado_at: number | null;
  motivo_anulacion: string | null;
  creado_at: number;
  actualizado_at: number;
  sync_estado: SyncEstado;
}

export interface AtencionConPaciente extends Atencion {
  paciente_codigo: string;
  paciente_nombre: string;
  paciente_sector: string;
  campana_nombre: string;
  usuario_nombre: string;
}

export type Metodo = 'DIGITAL' | 'PAPEL' | 'EXCEL';
export type Conectividad = 'EN_LINEA' | 'SIN_CONEXION' | 'DESCONOCIDA';

export interface Evaluacion {
  id: string;
  codigo: string;
  atencion_id: string | null;
  campana_id: string;
  metodo: Metodo;
  operador: string;
  inicio: number;
  fin: number;
  duracion_s: number;
  tiempo_busqueda_s: number | null;
  errores_validacion: number;
  errores_verificados: number | null;
  incompletos: number;
  correcciones: number;
  conectividad: Conectividad;
  guardado_exitoso: number;
  creado_at: number;
}

export interface EvaluacionSesion {
  id: string;
  campana_id: string;
  operador: string;
  metodo: Metodo;
  satisfaccion: number;
  tiempo_consolidacion_s: number | null;
  hojas_papel: number | null;
  notas: string | null;
  fecha: number;
}

export type EstadoRuta = 'EN_CURSO' | 'PAUSADA' | 'INTERRUMPIDA' | 'FINALIZADA';
export type OrigenRuta = 'CAPTURA' | 'SINTETICO';

export interface Ruta {
  id: string;
  campana_id: string;
  usuario_id: string;
  dispositivo_id: string | null;
  estado: EstadoRuta;
  inicio_ms: number;
  fin_ms: number | null;
  activo_ms: number;
  distancia_m: number;
  segmento_actual: number;
  tramo_inicio_ms: number | null;
  saltos_consecutivos: number;
  modo_traslado: ModoTraslado;
  origen: OrigenRuta;
  ultimo_punto_ms: number | null;
}

export interface RutaPunto {
  id: string;
  ruta_id: string;
  segmento: number;
  fecha_ms: number;
  lat: number;
  lon: number;
  precision_m: number | null;
}

export interface RutaParada {
  id: string;
  ruta_id: string;
  fecha_ms: number;
  etiqueta: string;
  lat: number;
  lon: number;
}

export interface RutaEvento {
  id: string;
  ruta_id: string;
  tipo: string;
  fecha_ms: number;
  detalle: string | null;
}

export interface Auditoria {
  id: string;
  usuario_id: string | null;
  entidad: string;
  entidad_id: string | null;
  accion: string;
  fecha: number;
  detalle: string | null;
}

/** Etiquetas generales de parada (sin datos personales). */
export const ETIQUETAS_PARADA = [
  'Punto de atención',
  'Punto de encuentro',
  'Descanso',
  'Abastecimiento',
  'Traslado de equipo',
  'Fin de jornada',
] as const;
