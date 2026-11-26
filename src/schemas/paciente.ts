import { z } from 'zod';
import { celularValido, cedulaValida, capitalizarNombre } from '../domain/text';
import { edadDesde, esFechaValida } from '../domain/time';
import type { Canal, CamposOpcionales, Sexo } from '../domain/types';
import type { DatosPacienteBd } from '../repositories/pacientes';

const NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;

/** Valores del formulario (texto, tal como se digitan). */
export const pacienteFormSchema = z
  .object({
    nombres: z.string().trim().min(2, 'Ingrese los nombres').max(60, 'Máximo 60 caracteres').regex(NOMBRE, 'Solo letras'),
    apellidos: z.string().trim().min(2, 'Ingrese los apellidos').max(60, 'Máximo 60 caracteres').regex(NOMBRE, 'Solo letras'),
    edad: z.string().trim(),
    sector: z.string().trim().min(2, 'Indique el sector o comunidad').max(60, 'Máximo 60 caracteres'),
    telefono: z.string().trim().refine((v) => v === '' || celularValido(v), 'Celular de 10 dígitos que inicie con 09'),
    cedula: z.string().trim().refine((v) => v === '' || cedulaValida(v), 'Cédula ecuatoriana no válida'),
    fecha_nacimiento: z.string().trim().refine((v) => v === '' || esFechaValida(v), 'Use el formato AAAA-MM-DD'),
    sexo: z.enum(['', 'F', 'M', 'OTRO']),
    consentimiento_contacto: z.boolean(),
    canal_preferido: z.enum(['WHATSAPP', 'SMS', 'NINGUNO']),
  })
  .superRefine((v, ctx) => {
    if (v.edad === '' && v.fecha_nacimiento === '') {
      ctx.addIssue({ code: 'custom', path: ['edad'], message: 'Ingrese la edad' });
    }
    if (v.edad !== '') {
      const n = Number(v.edad);
      if (!/^\d{1,3}$/.test(v.edad) || n > 120) ctx.addIssue({ code: 'custom', path: ['edad'], message: 'Edad entre 0 y 120 años' });
    }
    if (v.fecha_nacimiento !== '' && esFechaValida(v.fecha_nacimiento)) {
      const e = edadDesde(v.fecha_nacimiento, Date.now());
      if (e == null || e > 120) ctx.addIssue({ code: 'custom', path: ['fecha_nacimiento'], message: 'Fecha de nacimiento no válida' });
    }
    if (v.consentimiento_contacto) {
      if (v.telefono === '') ctx.addIssue({ code: 'custom', path: ['telefono'], message: 'Se requiere celular para contactar' });
      if (v.canal_preferido === 'NINGUNO') ctx.addIssue({ code: 'custom', path: ['canal_preferido'], message: 'Elija WhatsApp o SMS' });
    }
  });

export type PacienteForm = z.infer<typeof pacienteFormSchema>;

export const PACIENTE_FORM_VACIO: PacienteForm = {
  nombres: '',
  apellidos: '',
  edad: '',
  sector: '',
  telefono: '',
  cedula: '',
  fecha_nacimiento: '',
  sexo: '',
  consentimiento_contacto: false,
  canal_preferido: 'NINGUNO',
};

/** Convierte el formulario validado a los datos persistidos. Los campos opcionales solo se guardan si se habilitan. */
export function aDatosPaciente(f: PacienteForm, opcionalesHabilitados: boolean, ahoraMs: number): DatosPacienteBd {
  const opc: CamposOpcionales = {};
  if (opcionalesHabilitados) {
    if (f.cedula) opc.cedula = f.cedula;
    if (f.fecha_nacimiento) opc.fecha_nacimiento = f.fecha_nacimiento;
    if (f.sexo) opc.sexo = f.sexo as Sexo;
  }
  const edadCalculada = opc.fecha_nacimiento ? edadDesde(opc.fecha_nacimiento, ahoraMs) : null;
  return {
    nombres: capitalizarNombre(f.nombres),
    apellidos: capitalizarNombre(f.apellidos),
    edad: f.edad !== '' ? Number(f.edad) : edadCalculada,
    sector: f.sector.trim().replace(/\s+/g, ' '),
    telefono: f.telefono || null,
    campos_opcionales: opc,
    canal_preferido: (f.consentimiento_contacto ? f.canal_preferido : 'NINGUNO') as Canal,
  };
}
