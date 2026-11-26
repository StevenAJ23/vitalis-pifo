import { z } from 'zod';
import { calcularImc } from '../domain/imc';
import { CAMPOS_VITALES, RANGOS, parsearNumero, type CampoVital, type Mediciones } from '../domain/vitals';
import { esFechaHoraValida } from '../domain/time';
import type { Atencion, Oido } from '../domain/types';
import type { DatosClinicos } from '../repositories/atenciones';

const oido = z.enum(['SI', 'NO', 'NO_EVALUADO']);

function campoVital(campo: CampoVital) {
  const r = RANGOS[campo];
  return z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const n = parsearNumero(v);
      if (n == null) return; // vacío permitido: se guarda como nulo, nunca como cero
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: 'Ingrese solo números' });
        return;
      }
      if (r.entero && !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Debe ser un número entero' });
        return;
      }
      if (n < r.min || n > r.max) ctx.addIssue({ code: 'custom', message: `Fuera de rango (${r.min}–${r.max} ${r.unidad}). Revise la unidad.` });
    });
}

export const atencionFormSchema = z
  .object({
    sistolica: campoVital('sistolica'),
    diastolica: campoVital('diastolica'),
    frecuencia: campoVital('frecuencia'),
    temperatura: campoVital('temperatura'),
    spo2: campoVital('spo2'),
    peso: campoVital('peso'),
    talla_cm: campoVital('talla_cm'),
    oido_i: oido,
    oido_d: oido,
    observaciones: z.string().max(500, 'Máximo 500 caracteres'),
    seguimiento: z.boolean(),
    cita_at: z.string().trim(),
    motivo_correccion: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const s = parsearNumero(v.sistolica);
    const d = parsearNumero(v.diastolica);
    if ((s == null) !== (d == null)) {
      ctx.addIssue({ code: 'custom', path: [s == null ? 'sistolica' : 'diastolica'], message: 'Registre ambas presiones o ninguna' });
    }
    if (s != null && d != null && !Number.isNaN(s) && !Number.isNaN(d) && d >= s) {
      ctx.addIssue({ code: 'custom', path: ['diastolica'], message: 'La diastólica debe ser menor que la sistólica' });
    }
    if (v.cita_at !== '' && !esFechaHoraValida(v.cita_at)) {
      ctx.addIssue({ code: 'custom', path: ['cita_at'], message: 'Formato AAAA-MM-DD HH:MM' });
    }
    if (v.cita_at !== '' && !v.seguimiento) {
      ctx.addIssue({ code: 'custom', path: ['seguimiento'], message: 'Active el seguimiento para agendar una cita' });
    }
  });

export type AtencionForm = z.infer<typeof atencionFormSchema>;

export const ATENCION_FORM_VACIO: AtencionForm = {
  sistolica: '',
  diastolica: '',
  frecuencia: '',
  temperatura: '',
  spo2: '',
  peso: '',
  talla_cm: '',
  oido_i: 'NO_EVALUADO',
  oido_d: 'NO_EVALUADO',
  observaciones: '',
  seguimiento: false,
  cita_at: '',
  motivo_correccion: '',
};

export function medicionesDe(f: Pick<AtencionForm, CampoVital>): Mediciones {
  const m: Mediciones = {};
  for (const c of CAMPOS_VITALES) {
    const n = parsearNumero(f[c]);
    m[c] = n == null || Number.isNaN(n) ? null : n;
  }
  return m;
}

export function aDatosClinicos(f: AtencionForm, requiereRevision: boolean): DatosClinicos {
  const m = medicionesDe(f);
  return {
    sistolica: m.sistolica ?? null,
    diastolica: m.diastolica ?? null,
    frecuencia: m.frecuencia ?? null,
    temperatura: m.temperatura ?? null,
    spo2: m.spo2 ?? null,
    peso: m.peso ?? null,
    talla_cm: m.talla_cm ?? null,
    imc: calcularImc(m.peso, m.talla_cm),
    oido_i: f.oido_i as Oido,
    oido_d: f.oido_d as Oido,
    observaciones: f.observaciones.trim() || null,
    seguimiento: f.seguimiento,
    cita_at: f.seguimiento && f.cita_at ? f.cita_at : null,
    requiere_revision: requiereRevision,
  };
}

const txt = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export function formDesdeAtencion(a: Atencion): AtencionForm {
  return {
    sistolica: txt(a.sistolica),
    diastolica: txt(a.diastolica),
    frecuencia: txt(a.frecuencia),
    temperatura: txt(a.temperatura),
    spo2: txt(a.spo2),
    peso: txt(a.peso),
    talla_cm: txt(a.talla_cm),
    oido_i: a.oido_i,
    oido_d: a.oido_d,
    observaciones: a.observaciones ?? '',
    seguimiento: a.seguimiento === 1,
    cita_at: a.cita_at ?? '',
    motivo_correccion: '',
  };
}
