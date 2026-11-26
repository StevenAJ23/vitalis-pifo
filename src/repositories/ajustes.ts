import type { Db } from '../db/types';
import { CONFIG_GPS_DEFECTO, type ConfigGps, type ModoTraslado } from '../domain/gpsFilter';

export type ModoDatos = 'SINTETICO' | 'REAL';

export const AJUSTES_DEFECTO = {
  dispositivo_id: '',
  modo_datos: 'SINTETICO' as ModoDatos,
  campana_activa_id: '',
  inactividad_min: '10',
  campos_opcionales: '1', // cédula, nacimiento y sexo visibles (sección plegable); el administrador puede ocultarlos
  gps_intervalo_ms: String(CONFIG_GPS_DEFECTO.intervaloMs),
  gps_distancia_m: String(CONFIG_GPS_DEFECTO.distanciaM),
  gps_precision_max_m: String(CONFIG_GPS_DEFECTO.precisionMaxM),
  gps_modo: CONFIG_GPS_DEFECTO.modo as string,
  gps_pausa_senal_s: String(CONFIG_GPS_DEFECTO.pausaSenalMaxS),
  mapa_teselas: '0',
  mapa_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  aviso_version: '1.0',
  retencion_gps_dias: '90',
  respaldo_verificado_at: '',
  autorizacion_real: '',
  bloqueo_captura_pantalla: '0', // capturas permitidas por defecto (a pedido del equipo); el administrador puede bloquearlas
  api_url: '',
  actualizaciones_auto: '1',
  actualizacion_consultada_at: '',
  biometria_usuario: '',
  ultimo_usuario: '',
};

export type ClaveAjuste = keyof typeof AJUSTES_DEFECTO;

export async function leerAjuste(db: Db, clave: ClaveAjuste): Promise<string> {
  const r = await db.get<{ valor: string }>('SELECT valor FROM ajustes WHERE clave = ?', [clave]);
  return r?.valor ?? AJUSTES_DEFECTO[clave];
}

export async function guardarAjuste(db: Db, clave: ClaveAjuste, valor: string): Promise<void> {
  await db.run(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    [clave, valor],
  );
}

export async function leerTodos(db: Db): Promise<Record<ClaveAjuste, string>> {
  const filas = await db.all<{ clave: string; valor: string }>('SELECT clave, valor FROM ajustes');
  const out = { ...AJUSTES_DEFECTO } as Record<ClaveAjuste, string>;
  for (const f of filas) if (f.clave in out) out[f.clave as ClaveAjuste] = f.valor;
  return out;
}

function numeroEn(texto: string, defecto: number, min: number, max: number): number {
  const n = Number(texto);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(max, Math.max(min, n));
}

export async function leerConfigGps(db: Db): Promise<ConfigGps> {
  const a = await leerTodos(db);
  const d = CONFIG_GPS_DEFECTO;
  return {
    intervaloMs: numeroEn(a.gps_intervalo_ms, d.intervaloMs, 1000, 60000),
    distanciaM: numeroEn(a.gps_distancia_m, d.distanciaM, 0, 100),
    precisionMaxM: numeroEn(a.gps_precision_max_m, d.precisionMaxM, 5, 200),
    modo: (a.gps_modo === 'VEHICULO' ? 'VEHICULO' : 'A_PIE') as ModoTraslado,
    pausaSenalMaxS: numeroEn(a.gps_pausa_senal_s, d.pausaSenalMaxS, 30, 3600),
  };
}

/** Siguiente valor de una secuencia local (dentro de la transacción del llamador). */
export async function siguienteSecuencia(db: Db, nombre: string): Promise<number> {
  await db.run(
    'INSERT INTO secuencias (nombre, valor) VALUES (?, 1) ON CONFLICT(nombre) DO UPDATE SET valor = valor + 1',
    [nombre],
  );
  const r = await db.get<{ valor: number }>('SELECT valor FROM secuencias WHERE nombre = ?', [nombre]);
  return r?.valor ?? 1;
}
