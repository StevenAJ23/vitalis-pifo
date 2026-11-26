import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { obtenerDb } from '../db/expoDb';
import type { ModoTraslado } from '../domain/gpsFilter';
import type { Ruta } from '../domain/types';
import { leerAjuste, leerConfigGps } from '../repositories/ajustes';
import * as rutasRepo from '../repositories/rutas';
import type { Actor } from './contexto';
import { ErrorNegocio } from './contexto';
import { gpsStore, ingerir, TAREA_GPS, vaciarCola } from './gpsIngesta';
import * as rutaService from './rutaService';

/**
 * Controlador de captura GPS a nivel de aplicación (no de pantalla): la suscripción sobrevive a la navegación
 * entre módulos. Usa la tarea de segundo plano si el permiso "siempre" está concedido; si no, captura en primer
 * plano y lo informa. Nunca promete seguimiento si el sistema operativo termina la app.
 */

let suscripcion: Location.LocationSubscription | null = null;
let vigilancia: ReturnType<typeof setInterval> | null = null;
let ultimaComprobacionServicios = 0;

async function capturaEnSegundoPlanoActiva(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TAREA_GPS);
  } catch {
    return false;
  }
}

function iniciarVigilancia() {
  if (vigilancia) return;
  vigilancia = setInterval(async () => {
    const st = gpsStore.get();
    if (!st.ruta || st.ruta.estado !== 'EN_CURSO') return;
    const ahora = Date.now();
    if (ahora - ultimaComprobacionServicios > 15_000) {
      ultimaComprobacionServicios = ahora;
      try {
        const activos = await Location.hasServicesEnabledAsync();
        if (activos !== st.serviciosActivos) gpsStore.set({ serviciosActivos: activos });
      } catch {
        // si no se puede consultar se mantiene el último estado conocido
      }
    }
    const db = await obtenerDb();
    const cfg = await leerConfigGps(db);
    const ref = st.ultimaLectura?.fechaMs ?? st.ruta.tramo_inicio_ms ?? ahora;
    const umbral = Math.max(30_000, cfg.intervaloMs * 4);
    const senal = ahora - ref > umbral ? (st.ultimaLectura ? 'SIN_SENAL' : 'BUSCANDO') : st.senal;
    if (senal !== st.senal) gpsStore.set({ senal });
  }, 5000);
}

function detenerVigilancia() {
  if (vigilancia) clearInterval(vigilancia);
  vigilancia = null;
}

async function verificarPermisoPrimerPlano(): Promise<void> {
  const p = await Location.requestForegroundPermissionsAsync();
  gpsStore.set({ permisoPrimerPlano: p.granted ? 'concedido' : 'denegado' });
  if (!p.granted) {
    throw new ErrorNegocio('Permiso de ubicación denegado. Puede continuar registrando atenciones sin recorrido GPS.');
  }
  const servicios = await Location.hasServicesEnabledAsync();
  gpsStore.set({ serviciosActivos: servicios });
  if (!servicios) throw new ErrorNegocio('La ubicación del dispositivo está desactivada. Actívela para registrar el recorrido.');
}

async function arrancarCaptura(): Promise<void> {
  const db = await obtenerDb();
  const cfg = await leerConfigGps(db);
  const bg = await Location.getBackgroundPermissionsAsync();
  gpsStore.set({ permisoSegundoPlano: bg.granted ? 'concedido' : bg.canAskAgain ? 'sin_consultar' : 'denegado' });
  suscripcion?.remove();
  suscripcion = null;
  if (bg.granted) {
    await Location.startLocationUpdatesAsync(TAREA_GPS, {
      accuracy: Location.Accuracy.High,
      timeInterval: cfg.intervaloMs,
      distanceInterval: 0 /* por tiempo: también estando quieto (permanencias); el filtro de distancia lo aplica la app */,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Vitalis Pifo · Recorrido en curso',
        notificationBody: 'Se registra la ruta del equipo de campaña (no de pacientes). Abra la app para pausar o finalizar.',
        notificationColor: '#0F5F59',
        killServiceOnDestroy: false,
      },
    });
    gpsStore.set({ modoCaptura: 'SEGUNDO_PLANO', senal: 'BUSCANDO' });
  } else {
    suscripcion = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: cfg.intervaloMs, distanceInterval: 0 /* por tiempo: también estando quieto (permanencias); el filtro de distancia lo aplica la app */ },
      (loc) => {
        void ingerir([loc]);
      },
      (razon) => {
        gpsStore.set({ error: `Ubicación: ${razon}` });
      },
    );
    gpsStore.set({ modoCaptura: 'PRIMER_PLANO', senal: 'BUSCANDO' });
  }
  iniciarVigilancia();
}

/** Detiene la captura y confirma la escritura de la cola antes de cambiar el estado. */
async function detenerCaptura(): Promise<void> {
  suscripcion?.remove();
  suscripcion = null;
  if (await capturaEnSegundoPlanoActiva()) {
    await Location.stopLocationUpdatesAsync(TAREA_GPS);
  }
  detenerVigilancia();
  await vaciarCola();
  gpsStore.set({ modoCaptura: null });
}

function fijarRuta(ruta: Ruta | null) {
  gpsStore.set({ ruta, error: null });
}

export async function iniciarRecorrido(actor: Actor, campanaId: string, modo?: ModoTraslado): Promise<Ruta> {
  await verificarPermisoPrimerPlano(); // el permiso se solicita solo al iniciar
  const db = await obtenerDb();
  const cfg = await leerConfigGps(db);
  const ruta = await rutaService.iniciar(db, actor, {
    campanaId, modo: modo ?? cfg.modo, dispositivoId: await leerAjuste(db, 'dispositivo_id'),
  });
  gpsStore.set({ aceptados: 0, rechazados: {}, ultimaLectura: null, ultimaAceptadaMs: null, puntosVersion: 0 });
  fijarRuta(ruta);
  try {
    await arrancarCaptura();
  } catch (e) {
    // Sin captura no se deja una ruta "en curso" ficticia: se pausa y se informa.
    const pausada = await rutaService.pausar(db, actor, ruta.id);
    await rutasRepo.evento(db, ruta.id, 'ERROR_GPS', e instanceof Error ? e.message.slice(0, 200) : 'sin detalle');
    fijarRuta(pausada);
    throw new ErrorNegocio('No se pudo iniciar la captura GPS. El recorrido quedó en pausa.');
  }
  return ruta;
}

export async function pausarRecorrido(actor: Actor): Promise<void> {
  const r = gpsStore.get().ruta;
  if (!r) return;
  await detenerCaptura();
  fijarRuta(await rutaService.pausar(await obtenerDb(), actor, r.id));
}

export async function reanudarRecorrido(actor: Actor): Promise<void> {
  const r = gpsStore.get().ruta;
  if (!r) return;
  await verificarPermisoPrimerPlano();
  const db = await obtenerDb();
  fijarRuta(await rutaService.reanudar(db, actor, r.id));
  try {
    await arrancarCaptura();
  } catch (e) {
    fijarRuta(await rutaService.pausar(db, actor, r.id));
    throw e;
  }
}

export async function finalizarRecorrido(actor: Actor): Promise<Ruta | null> {
  const r = gpsStore.get().ruta;
  if (!r) return null;
  await detenerCaptura();
  const fin = await rutaService.finalizar(await obtenerDb(), actor, r.id);
  gpsStore.set({ ruta: null, senal: 'BUSCANDO', ultimaLectura: null });
  return fin;
}

/** Solicita el permiso "permitir siempre" y, si se concede durante un recorrido, cambia a captura en segundo plano. */
export async function habilitarSegundoPlano(): Promise<boolean> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return false;
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  gpsStore.set({ permisoSegundoPlano: bg.granted ? 'concedido' : 'denegado' });
  const st = gpsStore.get();
  if (bg.granted && st.ruta?.estado === 'EN_CURSO' && st.modoCaptura === 'PRIMER_PLANO') {
    await arrancarCaptura();
  }
  return bg.granted;
}

export async function consultarPermisos(): Promise<void> {
  try {
    const [fg, bg, serv] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
    ]);
    gpsStore.set({
      permisoPrimerPlano: fg.granted ? 'concedido' : fg.canAskAgain ? 'sin_consultar' : 'denegado',
      permisoSegundoPlano: bg.granted ? 'concedido' : bg.canAskAgain ? 'sin_consultar' : 'denegado',
      serviciosActivos: serv,
    });
  } catch {
    // en plataformas sin servicios de ubicación se mantiene el estado por defecto
  }
}

/**
 * Recuperación al iniciar la app: si la tarea en segundo plano sigue activa, se reanuda la vista del recorrido;
 * si la ruta figuraba EN_CURSO pero no hay captura, se marca INTERRUMPIDA y se pide reanudar o finalizar.
 */
export async function recuperarRecorrido(): Promise<'ninguna' | 'activa' | 'interrumpida' | 'pausada'> {
  const db = await obtenerDb();
  const r = await rutasRepo.abierta(db);
  await consultarPermisos();
  if (!r) {
    fijarRuta(null);
    return 'ninguna';
  }
  if (r.estado === 'EN_CURSO') {
    if (await capturaEnSegundoPlanoActiva()) {
      fijarRuta(r);
      gpsStore.set({ modoCaptura: 'SEGUNDO_PLANO' });
      iniciarVigilancia();
      return 'activa';
    }
    if (suscripcion) {
      fijarRuta(r);
      return 'activa';
    }
    fijarRuta(await rutaService.marcarInterrumpida(db, r.id, 'La app se reinició sin captura activa'));
    return 'interrumpida';
  }
  fijarRuta(r);
  return r.estado === 'INTERRUMPIDA' ? 'interrumpida' : 'pausada';
}

/** Registra en la ruta cuándo la app pasa a segundo plano sin permiso de captura en segundo plano. */
AppState.addEventListener('change', (estado) => {
  const st = gpsStore.get();
  if (estado === 'background' && st.ruta?.estado === 'EN_CURSO' && st.modoCaptura === 'PRIMER_PLANO') {
    void obtenerDb().then((db) => rutasRepo.evento(db, st.ruta!.id, 'APP_EN_SEGUNDO_PLANO', 'captura limitada a primer plano'));
  }
});
