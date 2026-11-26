import type { Rol } from '../domain/types';

/** Usuario autenticado que ejecuta una operación (para control de acceso y auditoría). */
export interface Actor {
  id: string;
  nombre: string;
  rol: Rol;
  codigo_operador: string;
}

/** Error de negocio con mensaje apto para mostrar al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

/** Mensaje para errores del acceso con huella/rostro/PIN: muestra la causa real si es del sistema. */
export function mensajeAccesoRapido(e: unknown): string {
  if (e instanceof Error && (e.name === 'ErrorNegocio' || e.name === 'ErrorAutenticacion')) return e.message;
  return `No se completó la verificación del teléfono${e instanceof Error && e.message ? ` (${e.message.slice(0, 120)})` : ''}. Puede usar su contraseña.`;
}

/** Mensaje seguro para la interfaz: no expone trazas ni detalles internos de SQL. */
export function mensajeError(e: unknown): string {
  if (e instanceof Error && (e.name === 'ErrorNegocio' || e.name === 'AccesoDenegadoError' || e.name === 'ClaveRespaldoIncorrectaError' || e.name === 'ErrorAutenticacion')) {
    return e.message;
  }
  if (e instanceof Error && /UNIQUE constraint/i.test(e.message)) return 'El registro ya existe.';
  if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) return 'Referencia inválida a otro registro.';
  if (e instanceof Error && /Ubicaci|permiso|GPS/i.test(e.message)) return e.message;
  return 'Ocurrió un error inesperado. Los datos no se modificaron.';
}
