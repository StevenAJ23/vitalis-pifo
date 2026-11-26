import { ATENCION_FORM_VACIO } from '../src/schemas/atencion';
import { PACIENTE_FORM_VACIO } from '../src/schemas/paciente';
import * as atenciones from '../src/services/atencionService';
import * as auth from '../src/services/authService';
import * as campanas from '../src/services/campanaService';
import * as evaluacion from '../src/services/evaluacionService';
import * as pacientes from '../src/services/pacienteService';
import * as seguridad from '../src/services/seguridadService';
import * as stats from '../src/services/statsService';
import { csvMatriz, aCsv } from '../src/services/exportService';
import { construirLote, marcarSincronizados, pendientes, sincronizar, TransporteRest, type TransporteSync } from '../src/sync/syncService';
import { leerAjuste, leerConfigGps, guardarAjuste } from '../src/repositories/ajustes';
import { listarAuditoria } from '../src/repositories/auditoria';
import { conAdmin, crearDbPrueba } from './helpers/sqljsDb';

jest.setTimeout(60_000);

async function base() {
  const { db } = await crearDbPrueba();
  const admin = await conAdmin(db);
  const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
  return { db, admin, campId };
}

describe('Campañas', () => {
  it('crear como ACTIVA la fija como campaña de trabajo; cerrarla la quita', async () => {
    const { db, admin, campId } = await base();
    expect((await campanas.activa(db))?.id).toBe(campId);
    await campanas.actualizar(db, admin, campId, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '2026-11-16', descripcion: '', responsable: 'Resp', estado: 'CERRADA' });
    expect(await campanas.activa(db)).toBeNull();
    await expect(campanas.seleccionarActiva(db, admin, campId)).rejects.toThrow(/ACTIVA/);
  });
});

describe('Evaluación del piloto', () => {
  it('compara métodos y separa errores de validación de errores verificados', async () => {
    const { db, admin, campId } = await base();
    const p = await pacientes.crear(db, admin, { ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Prueba', edad: '30', sector: 'Pifo' });
    const r = await atenciones.registrar(db, admin, {
      pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '60' }, atipicosConfirmados: false,
      medicion: { inicioMs: Date.now() - 30_000, busquedaS: 4, erroresValidacion: 2, conectividad: 'SIN_CONEXION' },
    });
    await evaluacion.registrarManual(db, admin, campId, { metodo: 'PAPEL', operador: 'op-03', duracion_s: '95,5', tiempo_busqueda_s: '20', incompletos: '1', errores_verificados: '2', correcciones: '1', conectividad: 'SIN_CONEXION', guardado_exitoso: true });
    await evaluacion.registrarManual(db, admin, campId, { metodo: 'PAPEL', operador: 'OP-03', duracion_s: '80', tiempo_busqueda_s: '', incompletos: '0', errores_verificados: '', correcciones: '0', conectividad: 'SIN_CONEXION', guardado_exitoso: true });
    await evaluacion.registrarSesion(db, admin, campId, { metodo: 'PAPEL', operador: 'OP-03', satisfaccion: 3, tiempo_consolidacion_min: '15', hojas_papel: '12', notas: '' });
    const ev = await db.get<{ id: string }>('SELECT id FROM evaluacion WHERE atencion_id = ?', [r.atencionId]);
    await evaluacion.fijarErroresVerificados(db, admin, ev!.id, 0);

    const res = await evaluacion.resumen(db, admin, campId);
    const dig = res.porMetodo.find((m) => m.metodo === 'DIGITAL')!;
    const pap = res.porMetodo.find((m) => m.metodo === 'PAPEL')!;
    expect(dig.n).toBe(1);
    expect(dig.erroresValidacion).toBe(2);
    expect(dig.erroresVerificados).toBe(0);
    expect(dig.verificados).toBe(1);
    expect(pap.n).toBe(2);
    expect(pap.tiempoMediana).toBeCloseTo(87.75, 2);
    expect(pap.erroresVerificados).toBe(2);
    expect(pap.verificados).toBe(1);
    expect(pap.satisfaccionMedia).toBe(3);
    expect(pap.consolidacionMediaS).toBe(900);
    const filasPapel = res.filas.filter((f) => f.metodo === 'PAPEL');
    expect(filasPapel.every((f) => f.operador === 'OP-03')).toBe(true);
    expect(filasPapel.every((f) => /^E-[A-Z0-9]{6}$/.test(f.codigo))).toBe(true);
    // Los registros digitales no pueden retirarse; los manuales sí
    await expect(evaluacion.eliminarManual(db, admin, ev!.id)).rejects.toThrow(/manuales/);
    await evaluacion.eliminarManual(db, admin, filasPapel[0].id);
  });

  it('CSV escapa comas y comillas y marca el BOM', () => {
    expect(aCsv(['a', 'b'], [['x,y', 'di "hola"']])).toBe('﻿a,b\r\n"x,y","di ""hola"""\r\n');
    expect(csvMatriz([]).startsWith('﻿codigo,')).toBe(true);
  });
});

describe('Estadísticas clínicas agregadas', () => {
  it('agrupa por sector, IMC y campos faltantes', async () => {
    const { db, admin, campId } = await base();
    for (const [sector, peso, talla] of [['Palugo', '70', '165'], ['Palugo', '90', '160'], ['Itulcachi', '50', '']] as const) {
      const p = await pacientes.crear(db, admin, { ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: `Prueba ${sector}`, edad: '30', sector });
      await atenciones.registrar(db, admin, {
        pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso, talla_cm: talla }, atipicosConfirmados: true,
        medicion: { inicioMs: Date.now() - 1000, busquedaS: null, erroresValidacion: 0, conectividad: 'EN_LINEA' },
      });
    }
    const c = await stats.clinicas(db, admin, campId);
    expect(c.porSector[0]).toEqual({ etiqueta: 'Palugo', valor: 2 });
    expect(c.imc.find((x) => x.etiqueta === '25–29,9')?.valor).toBe(1); // 25,71
    expect(c.imc.find((x) => x.etiqueta === '≥ 30')?.valor).toBe(1); // 35,16
    expect(c.faltantesPorCampo.find((x) => x.etiqueta === 'Talla')?.valor).toBe(1);
    const d = await stats.dashboard(db, admin, campId);
    expect(d.camposFaltantes).toBeGreaterThan(0);
    expect(d.camposPosibles).toBe(21);
  });
});

describe('Ajustes, auditoría y cuenta', () => {
  it('config GPS acota valores fuera de rango', async () => {
    const { db } = await crearDbPrueba();
    await guardarAjuste(db, 'gps_precision_max_m', '9999');
    await guardarAjuste(db, 'gps_modo', 'VEHICULO');
    const cfg = await leerConfigGps(db);
    expect(cfg.precisionMaxM).toBe(200);
    expect(cfg.modo).toBe('VEHICULO');
    expect(await leerAjuste(db, 'modo_datos')).toBe('SINTETICO');
  });

  it('cambio de contraseña exige la actual y queda auditado', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await expect(auth.cambiarClave(db, admin, 'incorrecta', 'NuevaClave123')).rejects.toThrow(/actual/);
    await auth.cambiarClave(db, admin, 'Clave1234', 'NuevaClave123');
    await expect(auth.iniciarSesion(db, 'admin', 'Clave1234')).rejects.toThrow();
    await expect(auth.iniciarSesion(db, 'admin', 'NuevaClave123')).resolves.toBeTruthy();
    const audit = await listarAuditoria(db, { accion: 'CAMBIO_CLAVE' });
    expect(audit).toHaveLength(1);
  });

  it('usuario nuevo debe cambiar la contraseña temporal; restablecer reinicia el bloqueo', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const id = await auth.crearUsuario(db, admin, { nombre: 'Médica Uno', usuario: 'med1', rol: 'MEDICO', clave: 'Temporal123' });
    const u = await auth.iniciarSesion(db, 'med1', 'Temporal123');
    expect(u.debe_cambiar_clave).toBe(1);
    expect(u.codigo_operador).toBe('OP-02');
    for (let i = 0; i < 5; i++) await auth.iniciarSesion(db, 'med1', 'x').catch(() => undefined);
    await auth.restablecerClave(db, admin, id, 'OtraTemporal1');
    await expect(auth.iniciarSesion(db, 'med1', 'OtraTemporal1')).resolves.toBeTruthy();
  });

  it('chequeos de seguridad reportan el estado real', async () => {
    const { db } = await crearDbPrueba();
    await conAdmin(db);
    const ch = await seguridad.chequeos(db, { sqlcipher: false, cipherVersion: null, claveEnAlmacenSeguro: false });
    const porId = Object.fromEntries(ch.map((c) => [c.id, c.ok]));
    expect(porId).toMatchObject({ cifrado: false, clave: false, auth: true, inactividad: true, fk: true, integridad: true, respaldo: false });
  });
});

describe('Preparación para API REST (sin envío automático)', () => {
  it('construye lotes pendientes y marca confirmados', async () => {
    const { db, admin } = await base();
    await pacientes.crear(db, admin, { ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Prueba', edad: '30', sector: 'Pifo' });
    const pend = await pendientes(db);
    expect(pend.pacientes).toBe(1);
    expect(pend.campanas).toBe(1);
    const lote = await construirLote(db);
    expect(lote.entidades.pacientes).toHaveLength(1);
    const enviados: unknown[] = [];
    const falso: TransporteSync = {
      enviar: async (l) => {
        enviados.push(l);
        return { aceptados: { pacientes: l.entidades.pacientes.map((p) => String(p.id)) } };
      },
    };
    const r = await sincronizar(db, admin, falso);
    expect(r.confirmados).toBe(1);
    expect((await pendientes(db)).pacientes).toBe(0);
    expect(await marcarSincronizados(db, {})).toBe(0);
    expect(() => new TransporteRest('http://inseguro.local', 't')).toThrow(/HTTPS/);
  });
});
