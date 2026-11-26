import { ATENCION_FORM_VACIO } from '../src/schemas/atencion';
import { PACIENTE_FORM_VACIO } from '../src/schemas/paciente';
import * as atenciones from '../src/services/atencionService';
import * as campanas from '../src/services/campanaService';
import * as pacientes from '../src/services/pacienteService';
import * as stats from '../src/services/statsService';
import { versionActual, VERSION_ESQUEMA } from '../src/db/migrations';
import { conAdmin, crearDbPrueba, reabrir } from './helpers/sqljsDb';
import type { Actor } from '../src/services/contexto';
import type { Db } from '../src/db/types';

const medicion = () => ({ inicioMs: Date.now() - 42_000, busquedaS: 6.5, erroresValidacion: 1, conectividad: 'SIN_CONEXION' as const });

async function preparar(): Promise<{ db: Db; admin: Actor; campId: string; exportar: () => Uint8Array }> {
  const { db, exportar } = await crearDbPrueba();
  const admin = await conAdmin(db);
  const campId = await campanas.crear(db, admin, { nombre: 'Campaña Pifo', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Dra. Prueba', estado: 'ACTIVA' });
  return { db, admin, campId, exportar };
}

const PAC = { ...PACIENTE_FORM_VACIO, nombres: 'ana lucía', apellidos: 'ficticio quishpe', edad: '34', sector: 'La Toglla' };

describe('Migraciones', () => {
  it('aplica el esquema versionado', async () => {
    const { db } = await crearDbPrueba();
    expect(await versionActual(db)).toBe(VERSION_ESQUEMA);
    const fk = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(fk?.foreign_keys).toBe(1);
  });
});

describe('Pacientes (checklist §08)', () => {
  it('crea, busca por nombre/código y detecta duplicados sin fusionar', async () => {
    const { db, admin } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    expect(p.codigo).toMatch(/^P-TOGL-0001$/);
    expect(p.nombres).toBe('Ana Lucía');
    expect(p.canal_preferido).toBe('NINGUNO');
    expect(p.consentimiento_contacto).toBe(false);

    expect((await pacientes.buscar(db, admin, 'lucia')).map((x) => x.id)).toEqual([p.id]);
    expect((await pacientes.buscar(db, admin, 'p-togl-0001')).map((x) => x.id)).toEqual([p.id]);
    expect(await pacientes.buscar(db, admin, "' OR 1=1 --")).toHaveLength(0);

    const dup = await pacientes.posiblesDuplicados(db, admin, { ...PAC, nombres: 'Ana Lucia', apellidos: 'Ficticio Quishpe', edad: '35' });
    expect(dup).toHaveLength(1);
    // Se puede crear igualmente (decisión del operador); no se fusiona.
    const p2 = await pacientes.crear(db, admin, { ...PAC, edad: '35' });
    expect(p2.codigo).toBe('P-TOGL-0002');
  });

  it('registra consentimiento de contacto independiente', async () => {
    const { db, admin } = await preparar();
    const p = await pacientes.crear(db, admin, { ...PAC, telefono: '0991234567', consentimiento_contacto: true, canal_preferido: 'WHATSAPP' });
    expect(p.consentimiento_contacto).toBe(true);
    await pacientes.actualizar(db, admin, p.id, { ...PAC, telefono: '0991234567', consentimiento_contacto: false, canal_preferido: 'NINGUNO' });
    const f = await pacientes.obtenerFicha(db, admin, p.id);
    expect(f.consentimiento_contacto).toBe(false);
    const audit = await db.all<{ accion: string; detalle: string | null }>('SELECT accion, detalle FROM auditoria WHERE entidad_id = ?', [p.id]);
    expect(audit.map((a) => a.accion)).toEqual(expect.arrayContaining(['CREAR', 'ACTUALIZAR', 'VER_FICHA']));
    // La auditoría no guarda valores personales
    expect(JSON.stringify(audit)).not.toContain('0991234567');
  });
});

describe('Atenciones', () => {
  it('registra dos atenciones del mismo paciente, con IMC y evaluación en la misma transacción', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    const r1 = await atenciones.registrar(db, admin, {
      pacienteId: p.id, campanaId: campId, atipicosConfirmados: false, medicion: medicion(),
      form: { ...ATENCION_FORM_VACIO, sistolica: '120', diastolica: '80', peso: '70', talla_cm: '165', temperatura: '36,6' },
    });
    await atenciones.registrar(db, admin, {
      pacienteId: p.id, campanaId: campId, atipicosConfirmados: false, medicion: medicion(),
      form: { ...ATENCION_FORM_VACIO, peso: '71' },
    });
    const hist = await atenciones.dePaciente(db, admin, p.id);
    expect(hist).toHaveLength(2);
    const a1 = hist.find((h) => h.id === r1.atencionId)!;
    expect(a1.imc).toBe(25.71);
    expect(a1.temperatura).toBe(36.6);
    const a2 = hist.find((h) => h.id !== r1.atencionId)!;
    expect(a2.imc).toBeNull(); // falta talla → nulo
    expect(a2.talla_cm).toBeNull();
    expect(a2.sistolica).toBeNull(); // nunca cero

    const ev = await db.all<{ metodo: string; incompletos: number; errores_validacion: number; atencion_id: string }>('SELECT * FROM evaluacion ORDER BY creado_at');
    expect(ev).toHaveLength(2);
    expect(ev[0].metodo).toBe('DIGITAL');
    expect(ev[0].errores_validacion).toBe(1);
    expect(ev.find((e) => e.atencion_id === r1.atencionId)?.incompletos).toBe(2); // frecuencia y SpO2

    const d = await stats.dashboard(db, admin, campId);
    expect(d.pacientesUnicos).toBe(1);
    expect(d.atenciones).toBe(2);
    expect(d.sectores).toBe(1);
    expect(d.registroMedioS).toBeGreaterThan(40);
  });

  it('exige confirmar atípicos y los marca para revisión médica', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    const form = { ...ATENCION_FORM_VACIO, sistolica: '190', diastolica: '110' };
    await expect(atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form, atipicosConfirmados: false, medicion: medicion() })).rejects.toThrow(/atípicos/);
    const r = await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form, atipicosConfirmados: true, medicion: medicion() });
    expect((await atenciones.obtener(db, admin, r.atencionId)).requiere_revision).toBe(1);
    await atenciones.marcarRevisada(db, admin, r.atencionId);
    expect((await atenciones.obtener(db, admin, r.atencionId)).revisado_por).toBe(admin.id);
  });

  it('corrección auditada con versión previa y control de concurrencia', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    const r = await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '70', talla_cm: '165' }, atipicosConfirmados: false, medicion: medicion() });
    await atenciones.corregir(db, admin, { id: r.atencionId, versionEsperada: 1, motivo: 'Error de digitación', atipicosConfirmados: false, form: { ...ATENCION_FORM_VACIO, peso: '72', talla_cm: '165' } });
    const a = await atenciones.obtener(db, admin, r.atencionId);
    expect(a.version).toBe(2);
    expect(a.imc).toBe(26.45);
    await expect(atenciones.corregir(db, admin, { id: r.atencionId, versionEsperada: 1, motivo: 'Otra corrección', atipicosConfirmados: false, form: { ...ATENCION_FORM_VACIO, peso: '73' } })).rejects.toThrow(/modificada/);
    expect(await atenciones.versiones(db, admin, r.atencionId)).toHaveLength(1);
    const ev = await db.get<{ correcciones: number }>('SELECT correcciones FROM evaluacion WHERE atencion_id = ?', [r.atencionId]);
    expect(ev?.correcciones).toBe(1);
    const au = await db.get<{ detalle: string }>("SELECT detalle FROM auditoria WHERE accion = 'CORREGIR'");
    expect(au?.detalle).toContain('peso');
    expect(au?.detalle).not.toContain('72');
  });

  it('anulación lógica: nunca borrado físico', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    const r = await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '70' }, atipicosConfirmados: false, medicion: medicion() });
    await atenciones.anular(db, admin, r.atencionId, 'Registro duplicado');
    const fila = await db.get<{ anulado_at: number | null }>('SELECT anulado_at FROM atenciones WHERE id = ?', [r.atencionId]);
    expect(fila?.anulado_at).not.toBeNull();
    expect((await stats.dashboard(db, admin, campId)).atenciones).toBe(0);
  });

  it('una campaña cerrada no admite atenciones y el fallo no deja registros parciales', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    await campanas.actualizar(db, admin, campId, { nombre: 'Campaña Pifo', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Dra. Prueba', estado: 'CERRADA' });
    await expect(atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '70' }, atipicosConfirmados: false, medicion: medicion() })).rejects.toThrow(/no está activa/);
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones');
    expect(n?.n).toBe(0);
    const fallida = await db.get<{ guardado_exitoso: number }>('SELECT guardado_exitoso FROM evaluacion');
    expect(fallida?.guardado_exitoso).toBe(0);
  });

  it('persistencia: cerrar y reabrir conserva cantidad e integridad', async () => {
    const { db, admin, campId, exportar } = await preparar();
    for (let i = 0; i < 3; i++) {
      const p = await pacientes.crear(db, admin, { ...PAC, nombres: `Paciente ${'abc'[i]}` });
      await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '60', talla_cm: '150' }, atipicosConfirmados: false, medicion: medicion() });
    }
    const db2 = await reabrir(exportar());
    expect((await db2.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones'))?.n).toBe(3);
    expect((await db2.get<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check).toBe('ok');
    expect((await db2.all<{ imc: number }>('SELECT imc FROM atenciones')).every((r) => r.imc === 26.67)).toBe(true);
  });

  it('dos guardados simultáneos se serializan sin corromper datos', async () => {
    const { db, admin, campId } = await preparar();
    const p = await pacientes.crear(db, admin, PAC);
    const args = { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '70' }, atipicosConfirmados: false, medicion: medicion() };
    await Promise.all([atenciones.registrar(db, admin, args), atenciones.registrar(db, admin, args)]);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones'))?.n).toBe(2);
  });
});

describe('Ajustes de campo (piloto 15/11)', () => {
  it('código del paciente P-ZONA-NÚMERO con numeración por zona', async () => {
    const { codigoZona } = jest.requireActual('../src/domain/text') as typeof import('../src/domain/text');
    expect(codigoZona('La Toglla')).toBe('TOGL');
    expect(codigoZona('Pifo Centro')).toBe('PIFO');
    expect(codigoZona('El Inga')).toBe('INGA');
    expect(codigoZona('San Juan de Itulcachi')).toBe('JUAN');
    const { db, admin } = await preparar();
    const a = await pacientes.crear(db, admin, { ...PAC, sector: 'Palugo' });
    const b = await pacientes.crear(db, admin, { ...PAC, nombres: 'Otra', sector: 'La Toglla' });
    const c = await pacientes.crear(db, admin, { ...PAC, nombres: 'Tercera', sector: 'Palugo' });
    expect([a.codigo, b.codigo, c.codigo]).toEqual(['P-PALU-0001', 'P-TOGL-0001', 'P-PALU-0002']);
  });

  it('un operador corrige solo sus propias atenciones', async () => {
    const { db, admin, campId } = await preparar();
    const auth = jest.requireActual('../src/services/authService') as typeof import('../src/services/authService');
    await auth.crearUsuario(db, admin, { nombre: 'Operador Uno', usuario: 'op1', rol: 'OPERADOR', clave: 'Operador123' });
    const op = auth.aActor(await auth.iniciarSesion(db, 'op1', 'Operador123'));
    const p = await pacientes.crear(db, op, PAC);
    const propia = await atenciones.registrar(db, op, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '60' }, atipicosConfirmados: false, medicion: medicion() });
    const ajena = await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '61' }, atipicosConfirmados: false, medicion: medicion() });
    expect((await atenciones.obtener(db, op, propia.atencionId)).peso).toBe(60);
    await atenciones.corregir(db, op, { id: propia.atencionId, versionEsperada: 1, motivo: 'Peso mal digitado', atipicosConfirmados: false, form: { ...ATENCION_FORM_VACIO, peso: '62' } });
    expect((await atenciones.obtener(db, op, propia.atencionId)).peso).toBe(62);
    await expect(atenciones.obtener(db, op, ajena.atencionId)).rejects.toThrow(/Acceso denegado/);
    await expect(atenciones.corregir(db, op, { id: ajena.atencionId, versionEsperada: 1, motivo: 'Intento ajeno', atipicosConfirmados: false, form: { ...ATENCION_FORM_VACIO, peso: '70' } })).rejects.toThrow(/Acceso denegado/);
  });

  it('SpO₂ de 90–92 % (altitud de Pifo) ya no se marca como atípica', () => {
    const { detectarAtipicos } = jest.requireActual('../src/domain/vitals') as typeof import('../src/domain/vitals');
    expect(detectarAtipicos({ spo2: 91 }, null)).toHaveLength(0);
    expect(detectarAtipicos({ spo2: 88 }, null).map((x) => x.campo)).toEqual(['spo2']);
  });
});
