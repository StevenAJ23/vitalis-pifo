import { z } from 'zod';
import { esFechaValida } from '../domain/time';
import { validarPoliticaClave } from '../security/passwords';

export const campanaFormSchema = z
  .object({
    nombre: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80),
    sector: z.string().trim().min(2, 'Indique el sector').max(60),
    inicio: z.string().trim().refine(esFechaValida, 'Fecha AAAA-MM-DD'),
    fin: z.string().trim().refine((v) => v === '' || esFechaValida(v), 'Fecha AAAA-MM-DD'),
    descripcion: z.string().trim().max(400, 'Máximo 400 caracteres'),
    responsable: z.string().trim().min(3, 'Indique el responsable').max(80),
    estado: z.enum(['PLANIFICADA', 'ACTIVA', 'CERRADA', 'ARCHIVADA']),
  })
  .superRefine((v, ctx) => {
    if (v.fin && esFechaValida(v.fin) && esFechaValida(v.inicio) && v.fin < v.inicio) {
      ctx.addIssue({ code: 'custom', path: ['fin'], message: 'La fecha final no puede ser anterior a la inicial' });
    }
  });
export type CampanaForm = z.infer<typeof campanaFormSchema>;

const clave = z.string().superRefine((v, ctx) => {
  const e = validarPoliticaClave(v);
  if (e) ctx.addIssue({ code: 'custom', message: e });
});

export const usuarioFormSchema = z
  .object({
    nombre: z.string().trim().min(3, 'Ingrese el nombre').max(80),
    usuario: z.string().trim().min(3, 'Mínimo 3 caracteres').max(30).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto, guion'),
    rol: z.enum(['ADMIN', 'MEDICO', 'OPERADOR', 'ANALISTA']),
    clave,
    confirmacion: z.string(),
  })
  .refine((v) => v.clave === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' });
export type UsuarioForm = z.infer<typeof usuarioFormSchema>;

export const cambioClaveSchema = z
  .object({ actual: z.string().min(1, 'Ingrese su contraseña actual'), nueva: clave, confirmacion: z.string() })
  .refine((v) => v.nueva === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' })
  .refine((v) => v.nueva !== v.actual, { path: ['nueva'], message: 'Debe ser distinta de la actual' });
export type CambioClaveForm = z.infer<typeof cambioClaveSchema>;

const entero = (min: number, max: number) =>
  z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `Entero entre ${min} y ${max}`);
const enteroOpcional = (min: number, max: number) =>
  z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `Entero entre ${min} y ${max}`);

export const evaluacionManualSchema = z.object({
  metodo: z.enum(['PAPEL', 'EXCEL']),
  operador: z.string().trim().min(2, 'Código de operador').max(20).regex(/^[A-Za-z0-9-]+$/, 'Use un código, no un nombre'),
  duracion_s: z.string().trim().refine((v) => /^\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) > 0 && Number(v.replace(',', '.')) < 7200, 'Segundos (0–7200)'),
  tiempo_busqueda_s: z.string().trim().refine((v) => v === '' || (/^\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) < 3600), 'Segundos'),
  incompletos: entero(0, 20),
  errores_verificados: enteroOpcional(0, 50),
  correcciones: entero(0, 50),
  conectividad: z.enum(['EN_LINEA', 'SIN_CONEXION', 'DESCONOCIDA']),
  guardado_exitoso: z.boolean(),
});
export type EvaluacionManualForm = z.infer<typeof evaluacionManualSchema>;

export const sesionSchema = z.object({
  metodo: z.enum(['DIGITAL', 'PAPEL', 'EXCEL']),
  operador: z.string().trim().min(2, 'Código de operador').max(20).regex(/^[A-Za-z0-9-]+$/, 'Use un código, no un nombre'),
  satisfaccion: z.number().int().min(1, 'Elija de 1 a 5').max(5),
  tiempo_consolidacion_min: z.string().trim().refine((v) => v === '' || (/^\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) < 1440), 'Minutos'),
  hojas_papel: enteroOpcional(0, 1000),
  notas: z.string().trim().max(300, 'Máximo 300 caracteres'),
});
export type SesionForm = z.infer<typeof sesionSchema>;
