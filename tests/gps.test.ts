import { ATENCION_FORM_VACIO } from '../src/schemas/atencion';
import { PACIENTE_FORM_VACIO } from '../src/schemas/paciente';
import * as atenciones from '../src/services/atencionService';
import * as pacientes from '../src/services/pacienteService';
import { CONFIG_GPS_DEFECTO, evaluarLectura, type Lectura } from '../src/domain/gpsFilter';
import * as campanas from '../src/services/campanaService';
import * as rutas from '../src/services/rutaService';
import { conAdmin, crearDbPrueba } from './helpers/sqljsDb';
import { fijarReloj } from './setup';

const ORIGEN = { lat: -0.2311, lon: -78.3383 };
/** Lectura a `metrosNorte` del origen. 1 m ≈ 1/111320 grados de latitud. */
const lec = (metrosNorte: number, t: number, precision = 5): Lectura => ({
  lat: ORIGEN.lat + metrosNorte / 111320, lon: ORIGEN.lon, precision, fechaMs: t,
});

describe('Filtro GPS (dominio)', () => {
  const est = { segmentoActual: 0, tramoInicioMs: 0, ultimo: null, saltosConsecutivos: 0 };
  it('descarta inválidas, sin precisión o precisión > 30 m', () => {
    expect(evaluarLectura({ lat: NaN, lon: 0, precision: 5, fechaMs: 1 }, est, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'invalida' });
    expect(evaluarLectura({ lat: 0, lon: 0, precision: 5, fechaMs: 1 }, est, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'invalida' });
    expect(evaluarLectura({ ...lec(0, 1), precision: null }, est, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'precision' });
    expect(evaluarLectura(lec(0, 1, 31), est, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'precision' });
  });
  it('detecta repetidas y saltos incompatibles con caminar', () => {
    const e = { ...est, ultimo: { ...lec(0, 1000), precision: 5, segmento: 0 } };
    expect(evaluarLectura(lec(2, 6000), e, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'repetida' });
    expect(evaluarLectura(lec(500, 6000), e, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'salto' });
    const ok = evaluarLectura(lec(8, 6000), e, CONFIG_GPS_DEFECTO);
    expect(ok.tipo).toBe('aceptar');
    if (ok.tipo === 'aceptar') expect(ok.distanciaSumada).toBeCloseTo(8, 0);
  });
  it('pérdida larga de señal abre segmento nuevo sin sumar distancia', () => {
    const e = { ...est, ultimo: { ...lec(0, 1000), precision: 5, segmento: 0 } };
    const d = evaluarLectura(lec(100, 1000 + 200_000), e, CONFIG_GPS_DEFECTO);
    expect(d).toMatchObject({ tipo: 'aceptar', segmento: 1, distanciaSumada: 0, nuevoSegmento: true });
  });
});

describe('Recorrido: iniciar, pausar, reanudar, finalizar (checklist §08)', () => {
  afterEach(() => fijarReloj(null));

  it('valida distancia, puntos, segmentos y duración activa', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña Pifo', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Dra. Prueba', estado: 'ACTIVA' });
    const t0 = 1_800_000_000_000;
    fijarReloj(t0);
    const r = await rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'dev' });
    await expect(rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'dev' })).rejects.toThrow(/sin finalizar/);

    // Tramo 1: 10 lecturas cada 5 s, 7 m entre cada una → 63 m
    const t1 = Array.from({ length: 10 }, (_, i) => lec(i * 7, t0 + i * 5000));
    const res1 = await rutas.registrarLecturas(db, r.id, t1, CONFIG_GPS_DEFECTO);
    expect(res1.aceptados).toBe(10);
    expect(res1.distanciaM).toBeCloseTo(63, 0);

    // Lecturas duplicadas (misma marca de tiempo) y de mala precisión no se guardan
    const res1b = await rutas.registrarLecturas(db, r.id, [lec(63, t0 + 45000), lec(80, t0 + 47000, 50)], CONFIG_GPS_DEFECTO);
    expect(res1b.aceptados).toBe(0);

    fijarReloj(t0 + 60_000);
    await rutas.pausar(db, admin, r.id);
    // Durante la pausa no se registran puntos
    const enPausa = await rutas.registrarLecturas(db, r.id, [lec(200, t0 + 70_000)], CONFIG_GPS_DEFECTO);
    expect(enPausa.rechazados.ruta_inactiva).toBe(1);

    fijarReloj(t0 + 120_000);
    const reanudada = await rutas.reanudar(db, admin, r.id);
    expect(reanudada.segmento_actual).toBe(1);
    // Tramo 2 desde otra posición (300 m): no se une con el tramo 1
    const t2 = Array.from({ length: 5 }, (_, i) => lec(300 + i * 10, t0 + 120_000 + i * 5000));
    await rutas.registrarLecturas(db, r.id, t2, CONFIG_GPS_DEFECTO);

    fijarReloj(t0 + 180_000);
    const fin = await rutas.finalizar(db, admin, r.id);
    expect(fin.estado).toBe('FINALIZADA');
    expect(fin.activo_ms).toBe(60_000 + 60_000); // 60 s antes de pausar + 60 s tras reanudar
    expect(fin.distancia_m).toBeCloseTo(63 + 40, 0); // sin sumar el salto entre segmentos

    const det = await rutas.detalle(db, admin, r.id);
    expect(det.puntos).toHaveLength(15);
    expect(rutas.segmentosDe(det.puntos)).toHaveLength(2);
    expect(det.eventos.map((e) => e.tipo)).toEqual(['INICIO', 'PAUSA', 'REANUDA', 'FIN']);
    await expect(rutas.pausar(db, admin, r.id)).rejects.toThrow();
  });

  it('reinicio sin captura: marca INTERRUMPIDA sin inventar tiempo y permite reanudar', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    const t0 = 1_800_000_000_000;
    fijarReloj(t0);
    const r = await rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'dev' });
    await rutas.registrarLecturas(db, r.id, [lec(0, t0 + 1000), lec(10, t0 + 30_000)], CONFIG_GPS_DEFECTO);
    fijarReloj(t0 + 3_600_000); // la app estuvo cerrada una hora
    const int = await rutas.marcarInterrumpida(db, r.id, 'app reiniciada');
    expect(int.estado).toBe('INTERRUMPIDA');
    expect(int.activo_ms).toBe(30_000); // solo hasta la última lectura real
    const re = await rutas.reanudar(db, admin, r.id);
    expect(re.estado).toBe('EN_CURSO');
    expect(re.segmento_actual).toBe(1);
  });

  it('paradas solo con etiquetas generales', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    const r = await rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'dev' });
    await expect(rutas.agregarParada(db, admin, r.id, 'Punto de atención', null)).rejects.toThrow(/posición/);
    await expect(rutas.agregarParada(db, admin, r.id, 'Casa de Juan Pérez', ORIGEN)).rejects.toThrow(/no permitida/);
    await rutas.agregarParada(db, admin, r.id, 'Punto de atención', ORIGEN);
    expect((await rutas.detalle(db, admin, r.id)).paradas).toHaveLength(1);
  });
});

describe('Actividad automática: brigada vs desplazamiento (sin marcar paradas)', () => {
  afterEach(() => fijarReloj(null));
  const { detectarPermanencias, estadoActual } = jest.requireActual('../src/domain/permanencias') as typeof import('../src/domain/permanencias');

  it('estando quieto acepta un "latido" por minuto sin sumar distancia (no se confunde con pérdida de señal)', () => {
    const e = { segmentoActual: 0, tramoInicioMs: 0, ultimo: { ...lec(0, 0), precision: 5, segmento: 0 }, saltosConsecutivos: 0 };
    expect(evaluarLectura(lec(1, 30_000), e, CONFIG_GPS_DEFECTO)).toEqual({ tipo: 'rechazar', motivo: 'repetida' });
    expect(evaluarLectura(lec(1, 60_000), e, CONFIG_GPS_DEFECTO)).toMatchObject({ tipo: 'aceptar', segmento: 0, distanciaSumada: 0, nuevoSegmento: false });
  });

  it('clasifica permanencias con atenciones como BRIGADA y las demás como PARADA', () => {
    const pts = [
      ...Array.from({ length: 5 }, (_, i) => ({ ...lec(i * 10, i * 10_000), segmento: 0 })), // caminando 0–40 s
      ...Array.from({ length: 6 }, (_, i) => ({ ...lec(45 + (i % 2), 60_000 + i * 60_000), segmento: 0 })), // quieto 1–6 min
      ...Array.from({ length: 5 }, (_, i) => ({ ...lec(200 + i * 10, 400_000 + i * 10_000), segmento: 0 })), // caminando
      ...Array.from({ length: 5 }, (_, i) => ({ ...lec(500, 500_000 + i * 60_000), segmento: 0 })), // quieto 4 min sin atenciones
    ];
    const p = detectarPermanencias(pts, [120_000, 200_000]);
    expect(p.map((x) => x.tipo)).toEqual(['BRIGADA', 'PARADA']);
    expect(p[0].atenciones).toBe(2);
    expect(p[0].duracionMs).toBeGreaterThanOrEqual(300_000); // incluye la llegada lenta al sitio
    expect(estadoActual(pts.slice(0, 9), [120_000], 300_000)).toBe('BRIGADA');
    expect(estadoActual(pts.slice(0, 5), [], 40_000)).toBe('MOVIMIENTO');
  });

  it('guardar una atención durante el recorrido deja solo una marca de hora en la ruta (sin paciente)', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    const r = await rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'dev' });
    const p = await pacientes.crear(db, admin, { ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Prueba', edad: '30', sector: 'Pifo' });
    await atenciones.registrar(db, admin, { pacienteId: p.id, campanaId: campId, form: { ...ATENCION_FORM_VACIO, peso: '60' }, atipicosConfirmados: false, medicion: { inicioMs: Date.now() - 1000, busquedaS: null, erroresValidacion: 0, conectividad: 'SIN_CONEXION' } });
    const ev = (await rutas.detalle(db, admin, r.id)).eventos.filter((e) => e.tipo === 'ATENCION');
    expect(ev).toHaveLength(1);
    expect(ev[0].detalle).toBeNull();
    expect(JSON.stringify(ev)).not.toContain(p.id);
  });
});
