import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';
import { mostrarDialogo } from './dialogo';
import { descargarEInstalar } from '../platform/instalador';
import { guardarAjuste } from '../repositories/ajustes';
import { buscarActualizacion, type InfoActualizacion } from '../services/actualizaciones';
import { appStore } from './app';
import { crearStore } from './store';

/** Estado del aviso de actualización (franja visible en toda la app). */
export interface EstadoActualizacion {
  disponible: InfoActualizacion | null;
  oculta: boolean; // "Más tarde": se oculta hasta el próximo inicio de la app
  progreso: number | null; // 0–1 mientras se descarga
}

export const actualizacionStore = crearStore<EstadoActualizacion>({ disponible: null, oculta: false, progreso: null });

const INTERVALO_MS = 30 * 60_000;
let enCurso = false;

/**
 * Comprobación automática (al abrir la app y al volver a primer plano), como máximo cada 30 min,
 * solo si está activada en Ajustes y hay internet. Silenciosa ante errores: nunca interrumpe el trabajo de campo.
 */
export async function comprobarActualizacionAuto(forzar = false): Promise<void> {
  const { db, ajustes } = appStore.get();
  if (!db || enCurso) return;
  if (ajustes.actualizaciones_auto !== '1' && !forzar) return;
  const ultima = Number(ajustes.actualizacion_consultada_at) || 0;
  if (!forzar && Date.now() - ultima < INTERVALO_MS) return;
  enCurso = true;
  try {
    const red = await NetInfo.fetch();
    if (!red.isConnected || red.isInternetReachable === false) return;
    const info = await buscarActualizacion();
    await guardarAjuste(db, 'actualizacion_consultada_at', String(Date.now()));
    appStore.set({ ajustes: { ...appStore.get().ajustes, actualizacion_consultada_at: String(Date.now()) } });
    actualizacionStore.set({ disponible: info.hayNueva ? info : null });
  } catch {
    // sin conexión o sin versiones publicadas: se reintenta en la próxima apertura
  } finally {
    enCurso = false;
  }
}

/** Descarga dentro de la app y abre el instalador de Android (un toque en "Instalar"). */
export async function instalarActualizacion(info: InfoActualizacion): Promise<void> {
  if (actualizacionStore.get().progreso != null) return; // ya descargando
  actualizacionStore.set({ progreso: 0, oculta: false });
  try {
    await descargarEInstalar(info.url, info.ultima, info.tamano, (p) => actualizacionStore.set({ progreso: p }));
  } catch (e) {
    mostrarDialogo({
      titulo: 'No se pudo actualizar',
      mensaje: `${e instanceof Error ? e.message : 'Error de descarga.'} Puede reintentar o descargarla desde el navegador.`,
      tono: 'error',
      botones: [
        { texto: 'Cerrar', estilo: 'cancelar' },
        { texto: 'Abrir en navegador', estilo: 'principal', onPress: () => void Linking.openURL(info.url) },
      ],
    });
  } finally {
    actualizacionStore.set({ progreso: null });
  }
}

/** Muestra novedades y ofrece actualizar ahora o más tarde. */
export function ofrecerDescarga(info: InfoActualizacion): void {
  mostrarDialogo({
    titulo: `Nueva versión ${info.ultima}`,
    mensaje: `${info.notas ? info.notas + '\n\n' : ''}Se descargará e instalará encima de la actual: sus datos se conservan. Android le pedirá confirmar con "Instalar".`,
    tono: 'info',
    botones: [
      { texto: 'Más tarde', estilo: 'cancelar', onPress: () => actualizacionStore.set({ oculta: true }) },
      { texto: 'Actualizar ahora', estilo: 'principal', onPress: () => void instalarActualizacion(info) },
    ],
  });
}
