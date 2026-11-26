import { calcularImc, formatearImc } from '../src/domain/imc';
import { detectarAtipicos, parsearNumero, contarFaltantes } from '../src/domain/vitals';
import { cedulaValida, celularValido, normalizar, escaparLike } from '../src/domain/text';
import { evaluarDuplicados } from '../src/domain/duplicates';
import { media, mediana, formatearDistancia } from '../src/domain/stats';
import { distancia, zoomParaCaja, aMundo, desdeMundo, generalizar } from '../src/domain/geo';
import { atencionFormSchema, ATENCION_FORM_VACIO, aDatosClinicos } from '../src/schemas/atencion';
import { pacienteFormSchema, PACIENTE_FORM_VACIO } from '../src/schemas/paciente';
import { edadDesde, esFechaHoraValida } from '../src/domain/time';

describe('IMC (checklist §08)', () => {
  it('70 kg y 165 cm → 25,71', () => {
    expect(calcularImc(70, 165)).toBe(25.71);
    expect(formatearImc(calcularImc(70, 165))).toBe('25,71');
  });
  it('es nulo si falta peso o talla; nunca usa cero', () => {
    expect(calcularImc(null, 165)).toBeNull();
    expect(calcularImc(70, null)).toBeNull();
    expect(calcularImc(70, 0)).toBeNull();
    expect(formatearImc(null)).toBe('—');
  });
  it('detecta unidades incoherentes (talla en metros) como atípico', () => {
    const imc = calcularImc(70, 1.65); // talla digitada en metros
    expect(detectarAtipicos({ peso: 70, talla_cm: 1.65 }, imc).some((a) => a.campo === 'imc')).toBe(true);
  });
});

describe('Validación de atención', () => {
  const base = { ...ATENCION_FORM_VACIO };
  it('acepta coma decimal y deja vacíos como nulos', () => {
    const r = atencionFormSchema.safeParse({ ...base, temperatura: '36,5', peso: '70', talla_cm: '165' });
    expect(r.success).toBe(true);
    const d = aDatosClinicos({ ...base, temperatura: '36,5', peso: '70', talla_cm: '165' }, false);
    expect(d.temperatura).toBe(36.5);
    expect(d.imc).toBe(25.71);
    expect(d.sistolica).toBeNull();
    expect(d.spo2).toBeNull();
  });
  it('rechaza valores fuera de rango, texto y diastólica ≥ sistólica', () => {
    expect(atencionFormSchema.safeParse({ ...base, temperatura: '365' }).success).toBe(false);
    expect(atencionFormSchema.safeParse({ ...base, frecuencia: 'abc' }).success).toBe(false);
    expect(atencionFormSchema.safeParse({ ...base, sistolica: '80', diastolica: '90' }).success).toBe(false);
    expect(atencionFormSchema.safeParse({ ...base, sistolica: '120' }).success).toBe(false); // falta diastólica
    expect(atencionFormSchema.safeParse({ ...base, spo2: '96.5' }).success).toBe(false); // entero
  });
  it('cita requiere seguimiento y formato válido', () => {
    expect(atencionFormSchema.safeParse({ ...base, cita_at: '2026-11-20 09:00' }).success).toBe(false);
    expect(atencionFormSchema.safeParse({ ...base, seguimiento: true, cita_at: '2026-11-20 09:00' }).success).toBe(true);
    expect(esFechaHoraValida('2026-02-30 09:00')).toBe(false);
  });
  it('marca atípicos sin diagnosticar', () => {
    const a = detectarAtipicos({ sistolica: 190, diastolica: 100, spo2: 85 }, null);
    expect(a.map((x) => x.campo)).toEqual(expect.arrayContaining(['sistolica', 'spo2']));
    expect(contarFaltantes({ sistolica: 120, diastolica: 80 })).toBe(5);
  });
  it('parsearNumero', () => {
    expect(parsearNumero('')).toBeNull();
    expect(parsearNumero(' 70,5 ')).toBe(70.5);
    expect(Number.isNaN(parsearNumero('7o'))).toBe(true);
  });
});

describe('Validación de paciente', () => {
  it('exige nombres, apellidos, sector y edad', () => {
    expect(pacienteFormSchema.safeParse(PACIENTE_FORM_VACIO).success).toBe(false);
    expect(pacienteFormSchema.safeParse({ ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Pérez', sector: 'Pifo', edad: '34' }).success).toBe(true);
  });
  it('consentimiento de contacto requiere celular y canal', () => {
    const r = pacienteFormSchema.safeParse({ ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Pérez', sector: 'Pifo', edad: '34', consentimiento_contacto: true });
    expect(r.success).toBe(false);
  });
  it('cédula y celular ecuatorianos', () => {
    expect(cedulaValida('1710034065')).toBe(true);
    expect(cedulaValida('1710034066')).toBe(false);
    expect(celularValido('0991234567')).toBe(true);
    expect(celularValido('991234567')).toBe(false);
  });
  it('edad desde fecha de nacimiento', () => {
    expect(edadDesde('2000-11-15', new Date(2026, 10, 14).getTime())).toBe(25);
    expect(edadDesde('2000-11-14', new Date(2026, 10, 14).getTime())).toBe(26);
  });
});

describe('Texto y duplicados', () => {
  it('normaliza tildes y escapa comodines', () => {
    expect(normalizar('  María  José ÑUÑEZ ')).toBe('maria jose nunez');
    expect(escaparLike('50%_a')).toBe('50\\%\\_a');
  });
  it('advierte duplicados sin fusionar', () => {
    const existentes = [
      { id: '1', nombres: 'María José', apellidos: 'Quishpe Tipán', edad: 40, sector: 'Pifo Centro', telefono: null },
      { id: '2', nombres: 'Pedro', apellidos: 'Andrade', edad: 10, sector: 'Palugo', telefono: null },
    ];
    const r = evaluarDuplicados({ nombres: 'Maria Jose', apellidos: 'Quishpe Tipan', edad: 41, sector: 'Pifo centro', telefono: null }, existentes);
    expect(r).toHaveLength(1);
    expect(r[0].paciente.id).toBe('1');
    expect(evaluarDuplicados({ nombres: 'Luis', apellidos: 'Morales', edad: 5, sector: 'X', telefono: null }, existentes)).toHaveLength(0);
  });
});

describe('Estadística y geodesia', () => {
  it('media y mediana', () => {
    expect(media([1, 2, 3, 10])).toBe(4);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(mediana([5, 1, 3])).toBe(3);
    expect(media([])).toBeNull();
  });
  it('Haversine: 1° de latitud ≈ 111,2 km', () => {
    expect(distancia({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1);
    expect(distancia({ lat: -0.23, lon: -78.33 }, { lat: -0.23, lon: -78.33 })).toBe(0);
  });
  it('proyección Mercator ida y vuelta', () => {
    const p = { lat: -0.2311, lon: -78.3383 };
    const w = aMundo(p, 16);
    const q = desdeMundo(w.x, w.y, 16);
    expect(q.lat).toBeCloseTo(p.lat, 6);
    expect(q.lon).toBeCloseTo(p.lon, 6);
    expect(zoomParaCaja({ minLat: -0.235, maxLat: -0.23, minLon: -78.34, maxLon: -78.335 }, 360, 300)).toBeGreaterThanOrEqual(14);
  });
  it('distancia siempre como estimación', () => {
    expect(formatearDistancia(850.4)).toBe('≈ 850 m');
    expect(formatearDistancia(1234)).toBe('≈ 1,23 km');
    expect(generalizar({ lat: -0.231149, lon: -78.338351 })).toEqual({ lat: -0.231, lon: -78.338 });
  });
});

describe('Versiones (actualizaciones)', () => {
  const { compararVersiones } = jest.requireActual('../src/domain/version') as typeof import('../src/domain/version');
  it('ordena versiones semánticas', () => {
    expect(compararVersiones('v0.2.2', '0.2.1')).toBeGreaterThan(0);
    expect(compararVersiones('0.2.10', '0.2.9')).toBeGreaterThan(0);
    expect(compararVersiones('0.2.1', '0.2.1')).toBe(0);
    expect(compararVersiones('0.2', '0.2.1')).toBeLessThan(0);
  });
});
