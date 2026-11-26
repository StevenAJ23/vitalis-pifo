import type { Db } from '../db/types';
import { media, mediana } from '../domain/stats';
import { now } from '../platform/runtime';
import { exigir } from '../security/permissions';
import type { Actor } from './contexto';
import * as rutasRepo from '../repositories/rutas';
import type { Ruta } from '../domain/types';
import { calcularActividad } from './rutaService';

export interface Dashboard {
  pacientesUnicos: number;
  atenciones: number;
  sectores: number;
  seguimiento: number;
  pendientesRevision: number;
  registroMedioS: number | null;
  registroMedianaS: number | null;
  registrosMedidos: number;
  camposFaltantes: number;
  camposPosibles: number;
  rutas: number;
  distanciaM: number;
  activoMs: number;
  paradas: number;
  puntosBrigada: number;
  brigadaMs: number;
  paradaMs: number;
  movimientoMs: number;
  atencionesHoy: number;
}

/** Indicadores del dashboard calculados en vivo desde la base (nunca valores estáticos). */
export async function dashboard(db: Db, actor: Actor, campanaId: string | null): Promise<Dashboard> {
  exigir(actor.rol, 'estadisticas.ver');
  const filtroA = campanaId ? 'AND a.campana_id = ?' : '';
  const pA = campanaId ? [campanaId] : [];
  const base = await db.get<{ pu: number; at: number; se: number; sg: number; rv: number }>(
    `SELECT COUNT(DISTINCT a.paciente_id) AS pu, COUNT(*) AS at, COUNT(DISTINCT p.sector) AS se,
       COALESCE(SUM(a.seguimiento), 0) AS sg,
       COALESCE(SUM(CASE WHEN a.requiere_revision = 1 AND a.revisado_at IS NULL THEN 1 ELSE 0 END), 0) AS rv
     FROM atenciones a JOIN pacientes p ON p.id = a.paciente_id WHERE a.anulado_at IS NULL ${filtroA}`,
    pA,
  );
  const inicioHoy = new Date(now());
  inicioHoy.setHours(0, 0, 0, 0);
  const hoy = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM atenciones a WHERE a.anulado_at IS NULL AND a.fecha >= ? ${filtroA}`,
    [inicioHoy.getTime(), ...pA],
  );
  const evals = await db.all<{ duracion_s: number; incompletos: number }>(
    `SELECT duracion_s, incompletos FROM evaluacion WHERE metodo = 'DIGITAL' AND guardado_exitoso = 1 ${campanaId ? 'AND campana_id = ?' : ''}`,
    pA,
  );
  const rutas = await db.all<Ruta>(`SELECT * FROM rutas r ${campanaId ? 'WHERE r.campana_id = ?' : ''}`, pA);
  let puntosBrigada = 0, brigadaMs = 0, paradaMs = 0, movimientoMs = 0, paradas = 0;
  for (const r of rutas) {
    const act = calcularActividad(r, await rutasRepo.puntos(db, r.id), await rutasRepo.eventos(db, r.id));
    puntosBrigada += act.resumen.puntosBrigada;
    brigadaMs += act.resumen.brigadaMs;
    paradaMs += act.resumen.paradaMs;
    movimientoMs += act.resumen.movimientoMs;
    paradas += act.resumen.paradas;
  }
  const t = now();
  const duraciones = evals.map((e) => e.duracion_s);
  return {
    pacientesUnicos: base?.pu ?? 0,
    atenciones: base?.at ?? 0,
    sectores: base?.se ?? 0,
    seguimiento: base?.sg ?? 0,
    pendientesRevision: base?.rv ?? 0,
    registroMedioS: media(duraciones),
    registroMedianaS: mediana(duraciones),
    registrosMedidos: duraciones.length,
    camposFaltantes: evals.reduce((a, e) => a + e.incompletos, 0),
    camposPosibles: evals.length * 7,
    rutas: rutas.length,
    distanciaM: rutas.reduce((a, r) => a + (r.distancia_m ?? 0), 0),
    activoMs: rutas.reduce((a, r) => a + (r.activo_ms ?? 0) + (r.estado === 'EN_CURSO' && r.tramo_inicio_ms ? t - r.tramo_inicio_ms : 0), 0),
    paradas,
    puntosBrigada,
    brigadaMs,
    paradaMs,
    movimientoMs,
    atencionesHoy: hoy?.n ?? 0,
  };
}

export interface Conteo {
  etiqueta: string;
  valor: number;
}

export interface EstadisticasClinicas {
  porSector: Conteo[];
  porDia: Conteo[];
  faltantesPorCampo: Conteo[];
  imc: Conteo[];
  oidos: Conteo[];
}

/** Agregados clínicos (sin identificar personas). Solo roles con permiso clínico. */
export async function clinicas(db: Db, actor: Actor, campanaId: string | null): Promise<EstadisticasClinicas> {
  exigir(actor.rol, 'estadisticas.clinicas');
  const f = campanaId ? 'AND a.campana_id = ?' : '';
  const p = campanaId ? [campanaId] : [];
  const porSector = await db.all<Conteo>(
    `SELECT p.sector AS etiqueta, COUNT(*) AS valor FROM atenciones a JOIN pacientes p ON p.id = a.paciente_id
     WHERE a.anulado_at IS NULL ${f} GROUP BY p.sector ORDER BY valor DESC LIMIT 12`,
    p,
  );
  const filas = await db.all<{ fecha: number }>(`SELECT a.fecha FROM atenciones a WHERE a.anulado_at IS NULL ${f}`, p);
  const dias = new Map<string, number>();
  for (const r of filas) {
    const d = new Date(r.fecha);
    const k = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    dias.set(k, (dias.get(k) ?? 0) + 1);
  }
  const fal = await db.get<Record<string, number>>(
    `SELECT COALESCE(SUM(a.sistolica IS NULL),0) AS "Presión", COALESCE(SUM(a.frecuencia IS NULL),0) AS "Frecuencia",
       COALESCE(SUM(a.temperatura IS NULL),0) AS "Temperatura", COALESCE(SUM(a.spo2 IS NULL),0) AS "SpO₂",
       COALESCE(SUM(a.peso IS NULL),0) AS "Peso", COALESCE(SUM(a.talla_cm IS NULL),0) AS "Talla",
       COALESCE(SUM(a.oido_i = 'NO_EVALUADO' OR a.oido_d = 'NO_EVALUADO'),0) AS "Oídos"
     FROM atenciones a WHERE a.anulado_at IS NULL ${f}`,
    p,
  );
  const imc = await db.all<Conteo>(
    `SELECT CASE WHEN a.imc < 18.5 THEN '< 18,5' WHEN a.imc < 25 THEN '18,5–24,9' WHEN a.imc < 30 THEN '25–29,9' ELSE '≥ 30' END AS etiqueta,
       COUNT(*) AS valor FROM atenciones a WHERE a.anulado_at IS NULL AND a.imc IS NOT NULL ${f} GROUP BY etiqueta`,
    p,
  );
  const ordenImc = ['< 18,5', '18,5–24,9', '25–29,9', '≥ 30'];
  const oidos = await db.get<{ si: number; no: number; ne: number }>(
    `SELECT COALESCE(SUM((a.oido_i='SI') + (a.oido_d='SI')),0) AS si, COALESCE(SUM((a.oido_i='NO') + (a.oido_d='NO')),0) AS no,
       COALESCE(SUM((a.oido_i='NO_EVALUADO') + (a.oido_d='NO_EVALUADO')),0) AS ne FROM atenciones a WHERE a.anulado_at IS NULL ${f}`,
    p,
  );
  return {
    porSector,
    porDia: [...dias.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).slice(-14),
    faltantesPorCampo: Object.entries(fal ?? {}).map(([etiqueta, valor]) => ({ etiqueta, valor: Number(valor) })),
    imc: ordenImc.map((e) => ({ etiqueta: e, valor: imc.find((x) => x.etiqueta === e)?.valor ?? 0 })),
    oidos: [
      { etiqueta: 'Con tapón', valor: oidos?.si ?? 0 },
      { etiqueta: 'Sin tapón', valor: oidos?.no ?? 0 },
      { etiqueta: 'No evaluado', valor: oidos?.ne ?? 0 },
    ],
  };
}
