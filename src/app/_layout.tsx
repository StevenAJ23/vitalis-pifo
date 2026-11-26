// Efectos globales: runtime criptográfico y definición de la tarea GPS (debe estar en ámbito global).
import '../platform/expoRuntime';
import '../services/gps-task';

import { Stack } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PantallaBloqueo } from '../components/PantallaBloqueo';
import { PantallaErrorInicio } from '../components/PantallaErrorInicio';
import { Cargando } from '../components/ui';
import { limpiarExportes } from '../platform/files';
import { auditar } from '../repositories/auditoria';
import { recuperarRecorrido } from '../services/gps';
import { comprobarActualizacionAuto } from '../state/actualizacion';
import { avisar } from '../state/dialogo';
import { Dialogos } from '../components/Dialogos';
import {
  appStore,
  bloquearSesion,
  iniciarApp,
  msDesdeActividad,
  registrarActividad,
  sesionStore,
  useApp,
  useSesion,
} from '../state/app';
import { colores } from '../theme';

function vigilarInactividad() {
  const s = sesionStore.get();
  const { ajustes, db } = appStore.get();
  if (!s.usuario || s.bloqueada) return;
  const limite = Math.max(1, Number(ajustes.inactividad_min) || 5) * 60_000;
  if (msDesdeActividad() > limite) {
    bloquearSesion();
    if (db) void auditar(db, { usuarioId: s.usuario.id, entidad: 'sesion', accion: 'BLOQUEO_INACTIVIDAD' });
  }
}

export default function RootLayout() {
  const app = useApp();
  const sesion = useSesion();

  useEffect(() => {
    limpiarExportes();
    void iniciarApp();
  }, []);

  // Recuperación del recorrido tras reinicio (no depende de la sesión: la tarea pudo seguir en segundo plano).
  useEffect(() => {
    if (app.fase !== 'listo') return;
    void recuperarRecorrido()
      .then((r) => {
        if (r === 'interrumpida') {
          avisar(
            'Recorrido interrumpido',
            'La app se cerró mientras se registraba un recorrido. Abra "Recorrido" para reanudarlo (nuevo segmento) o finalizarlo. No se inventan posiciones del periodo sin captura.',
            'aviso',
          );
        }
      })
      .catch(() => undefined);
  }, [app.fase]);

  // Aviso de nuevas versiones: al abrir la app (ya lista) y al volver a primer plano.
  useEffect(() => {
    if (app.fase === 'listo') void comprobarActualizacionAuto();
  }, [app.fase]);

  // Bloqueo por inactividad (también al volver desde segundo plano).
  useEffect(() => {
    const t = setInterval(vigilarInactividad, 10_000);
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') {
        vigilarInactividad();
        void comprobarActualizacionAuto();
      }
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);

  // Protección contra capturas de pantalla (MASVS-PLATFORM), configurable por el administrador.
  const bloquearCapturas = app.ajustes.bloqueo_captura_pantalla === '1';
  useEffect(() => {
    if (app.fase !== 'listo') return;
    (bloquearCapturas ? ScreenCapture.preventScreenCaptureAsync() : ScreenCapture.allowScreenCaptureAsync()).catch(() => undefined);
  }, [bloquearCapturas, app.fase]);

  if (app.fase === 'cargando') {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colores.fondo }}>
          <Cargando texto="Abriendo base de datos cifrada…" />
        </View>
      </SafeAreaProvider>
    );
  }
  if (app.fase === 'error') {
    return (
      <SafeAreaProvider>
        <PantallaErrorInicio mensaje={app.error ?? 'Error desconocido'} />
        <Dialogos />
      </SafeAreaProvider>
    );
  }

  const conSesion = !!sesion.usuario;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => {
          registrarActividad();
          return false;
        }}
      >
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo } }}>
          <Stack.Screen
            name="manual"
            options={{ headerShown: true, title: 'Manual de usuario', headerTintColor: colores.primario, headerStyle: { backgroundColor: colores.superficie } }}
          />
          <Stack.Protected guard={app.requiereConfiguracion}>
            <Stack.Screen name="configuracion-inicial" />
          </Stack.Protected>
          <Stack.Protected guard={!app.requiereConfiguracion && !conSesion}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={!app.requiereConfiguracion && conSesion}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
        {conSesion && sesion.bloqueada ? <PantallaBloqueo /> : null}
        <Dialogos />
      </View>
    </SafeAreaProvider>
  );
}
