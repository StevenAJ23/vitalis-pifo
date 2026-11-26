import { router } from 'expo-router';
import { Download, FlaskConical, Navigation, Pause, TriangleAlert } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatearDistancia, formatearDuracion } from '../domain/stats';
import { gpsStore } from '../services/gpsIngesta';
import { actualizacionStore, ofrecerDescarga } from '../state/actualizacion';
import { appStore, sesionStore } from '../state/app';
import { puede } from '../security/permissions';
import { useStore } from '../state/store';
import { colores, espacio } from '../theme';
import { useDuracionActiva } from './hooks';

/**
 * Indicador persistente y visible en todos los módulos:
 * - Recorrido GPS activo/pausado/interrumpido (con cronómetro y distancia), toque para abrir el recorrido.
 * - Modo de prueba (solo datos ficticios).
 */
export function BarraEstado() {
  const gps = useStore(gpsStore);
  const app = useStore(appStore);
  const ms = useDuracionActiva(gps.ruta);
  const ruta = gps.ruta;
  const act = useStore(actualizacionStore);
  const sesion = useStore(sesionStore);
  return (
    <View>
      {act.progreso != null ? (
        <View style={[estilos.banda, { backgroundColor: colores.info }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(act.progreso * 100) }}>
          <Download size={14} color="#fff" />
          <Text style={[estilos.texto, { color: '#fff' }]} numberOfLines={1}>
            Descargando actualización… {Math.round(act.progreso * 100)} %
          </Text>
        </View>
      ) : act.disponible && !act.oculta ? (
        <Pressable
          onPress={() => act.disponible && ofrecerDescarga(act.disponible)}
          accessibilityRole="button"
          accessibilityLabel={`Nueva versión ${act.disponible.ultima} disponible. Toque para actualizar`}
          style={[estilos.banda, { backgroundColor: colores.info }]}
        >
          <Download size={14} color="#fff" />
          <Text style={[estilos.texto, { color: '#fff' }]} numberOfLines={1}>
            Nueva versión {act.disponible.ultima} disponible · Toque para actualizar
          </Text>
        </Pressable>
      ) : null}
      {app.ajustes.modo_datos === 'SINTETICO' ? (
        <Pressable
          onPress={() => (puede(sesion.usuario?.rol, 'seguridad.gestionar') ? router.push('/pasar-a-real') : undefined)}
          disabled={!puede(sesion.usuario?.rol, 'seguridad.gestionar')}
          style={[estilos.banda, { backgroundColor: colores.avisoSuave }]}
          accessibilityRole={puede(sesion.usuario?.rol, 'seguridad.gestionar') ? 'button' : 'text'}
        >
          <FlaskConical size={14} color={colores.aviso} />
          <Text style={[estilos.texto, { color: colores.aviso }]} numberOfLines={1}>
            Modo de prueba · solo datos ficticios{puede(sesion.usuario?.rol, 'seguridad.gestionar') ? ' · Toque para pasar a reales' : ''}
          </Text>
        </Pressable>
      ) : null}
      {ruta ? (
        <Pressable
          onPress={() => router.navigate('/recorrido')}
          accessibilityRole="button"
          accessibilityLabel="Abrir recorrido GPS"
          style={[
            estilos.banda,
            { backgroundColor: ruta.estado === 'EN_CURSO' ? colores.acento : ruta.estado === 'PAUSADA' ? colores.textoSec : colores.peligro },
          ]}
        >
          {ruta.estado === 'EN_CURSO' ? <Navigation size={14} color="#fff" /> : ruta.estado === 'PAUSADA' ? <Pause size={14} color="#fff" /> : <TriangleAlert size={14} color="#fff" />}
          <Text style={[estilos.texto, { color: '#fff' }]} numberOfLines={1}>
            {ruta.estado === 'EN_CURSO'
              ? `GPS activo${gps.modoCaptura === 'PRIMER_PLANO' ? ' (primer plano)' : ''} · ${formatearDuracion(ms)} · ${formatearDistancia(ruta.distancia_m)}${gps.senal === 'SIN_SENAL' ? ' · sin señal' : ''}`
              : ruta.estado === 'PAUSADA'
                ? `Recorrido en pausa · ${formatearDuracion(ms)} · ${formatearDistancia(ruta.distancia_m)}`
                : 'Recorrido interrumpido · toque para reanudar o finalizar'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  banda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: espacio.lg, paddingVertical: 7 },
  texto: { fontSize: 13, fontWeight: '600', flex: 1 },
});
