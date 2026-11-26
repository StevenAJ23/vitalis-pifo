import type { LucideIcon } from 'lucide-react-native';
import { CircleAlert, CircleCheck, CircleHelp, Info, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cerrarDialogo, dialogoStore, type TonoDialogo } from '../state/dialogo';
import { useStore } from '../state/store';
import { colores, espacio, radio, tipo } from '../theme';

const TONO: Record<TonoDialogo, { icono: LucideIcon; color: string; fondo: string }> = {
  info: { icono: Info, color: colores.info, fondo: colores.infoSuave },
  exito: { icono: CircleCheck, color: colores.exito, fondo: colores.exitoSuave },
  aviso: { icono: TriangleAlert, color: colores.aviso, fondo: colores.avisoSuave },
  error: { icono: CircleAlert, color: colores.peligro, fondo: colores.peligroSuave },
  pregunta: { icono: CircleHelp, color: colores.primario, fondo: colores.primarioSuave },
};

/** Capa global de diálogos y notificaciones con el estilo de la app (montada en el layout raíz). */
export function Dialogos() {
  const { cola, notificacion } = useStore(dialogoStore);
  const d = cola[0];
  const insets = useSafeAreaInsets();
  const [opacidad] = useState(() => new Animated.Value(0));
  const [toast] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!d) return;
    opacidad.setValue(0);
    Animated.timing(opacidad, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.timing(toast, { toValue: notificacion ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [notificacion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Botón atrás de Android = cancelar.
  useEffect(() => {
    if (!d) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cerrarDialogo(d.botones.find((b) => b.estilo === 'cancelar') ?? (d.botones.length === 1 ? d.botones[0] : undefined));
      return true;
    });
    return () => sub.remove();
  }, [d]);

  const t = d ? TONO[d.tono] : null;
  const nt = notificacion ? TONO[notificacion.tono] : null;

  return (
    <>
      {notificacion && nt ? (
        <Animated.View
          pointerEvents="none"
          style={[
            estilos.toast,
            { bottom: insets.bottom + 84, opacity: toast, transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
          ]}
          accessibilityLiveRegion="polite"
        >
          <nt.icono size={18} color="#FFFFFF" />
          <Text style={estilos.toastTexto}>{notificacion.texto}</Text>
        </Animated.View>
      ) : null}
      {d && t ? (
        <Animated.View style={[StyleSheet.absoluteFill, estilos.velo, { opacity: opacidad }]} accessibilityViewIsModal>
          <View style={estilos.tarjeta} accessibilityRole="alert">
            <View style={[estilos.icono, { backgroundColor: t.fondo }]}>
              <t.icono size={28} color={t.color} />
            </View>
            <Text style={[tipo.subtitulo, { textAlign: 'center', fontSize: 18 }]}>{d.titulo}</Text>
            {d.mensaje ? (
              <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingVertical: 4 }}>
                <Text style={[tipo.secundario, { textAlign: 'center', lineHeight: 21 }]}>{d.mensaje}</Text>
              </ScrollView>
            ) : null}
            <View style={[estilos.botones, d.botones.length > 2 && { flexDirection: 'column' }]}>
              {d.botones.map((b, i) => {
                const principal = b.estilo === 'principal';
                const destructivo = b.estilo === 'destructivo';
                const fondo = destructivo ? colores.peligro : principal ? colores.primario : colores.superficie;
                return (
                  <Pressable
                    key={i}
                    onPress={() => cerrarDialogo(b)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      estilos.boton,
                      { backgroundColor: fondo, borderColor: principal || destructivo ? fondo : colores.bordeFuerte },
                      d.botones.length <= 2 && { flex: 1 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[estilos.botonTexto, { color: principal || destructivo ? '#FFFFFF' : colores.primario }]}>{b.texto}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

const estilos = StyleSheet.create({
  velo: { backgroundColor: 'rgba(16,24,40,0.55)', alignItems: 'center', justifyContent: 'center', padding: espacio.lg, zIndex: 1000, elevation: 1000 },
  tarjeta: { width: '100%', maxWidth: 420, backgroundColor: colores.superficie, borderRadius: 20, padding: espacio.xl, gap: espacio.sm, alignItems: 'stretch' },
  icono: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  botones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.md },
  boton: { minHeight: 48, borderRadius: radio.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.md },
  botonTexto: { fontSize: 16, fontWeight: '700' },
  toast: {
    position: 'absolute', left: espacio.lg, right: espacio.lg, alignSelf: 'center', maxWidth: 480, flexDirection: 'row', alignItems: 'center',
    gap: espacio.sm, backgroundColor: '#101828', borderRadius: radio.pill, paddingVertical: 12, paddingHorizontal: espacio.lg, zIndex: 1001, elevation: 1001,
  },
  toastTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 },
});
