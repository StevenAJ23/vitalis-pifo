import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useAccion } from '../../../components/hooks';
import { Aviso, Boton, Campo, DatoFila, Pantalla, Seccion, Segmentado, Tarjeta, avisar, notificar } from '../../../components/ui';
import { mensajeError } from '../../../services/contexto';
import * as gps from '../../../services/gps';
import { gpsStore } from '../../../services/gpsIngesta';
import { cambiarAjuste, useActor, useApp } from '../../../state/app';
import { useStore } from '../../../state/store';
import { espacio, tipo } from '../../../theme';

const PERMISO = { concedido: 'Concedido', denegado: 'Denegado', sin_consultar: 'Sin solicitar' } as const;

export default function ConfigGps() {
  const { ajustes } = useApp();
  const actor = useActor();
  const st = useStore(gpsStore);
  const { ocupado, ejecutar } = useAccion();
  const [v, setV] = useState({
    intervalo: String(Number(ajustes.gps_intervalo_ms) / 1000),
    distancia: ajustes.gps_distancia_m,
    precision: ajustes.gps_precision_max_m,
    pausa: ajustes.gps_pausa_senal_s,
    modo: ajustes.gps_modo,
  });
  const err = {
    intervalo: !/^\d+$/.test(v.intervalo) || +v.intervalo < 1 || +v.intervalo > 60 ? '1–60 s' : undefined,
    distancia: !/^\d+$/.test(v.distancia) || +v.distancia > 100 ? '0–100 m' : undefined,
    precision: !/^\d+$/.test(v.precision) || +v.precision < 5 || +v.precision > 200 ? '5–200 m' : undefined,
    pausa: !/^\d+$/.test(v.pausa) || +v.pausa < 30 || +v.pausa > 3600 ? '30–3600 s' : undefined,
  };
  const valido = !Object.values(err).some(Boolean);

  const guardar = () =>
    ejecutar(async () => {
      try {
        await cambiarAjuste('gps_intervalo_ms', String(+v.intervalo * 1000), actor.id);
        await cambiarAjuste('gps_distancia_m', v.distancia, actor.id);
        await cambiarAjuste('gps_precision_max_m', v.precision, actor.id);
        await cambiarAjuste('gps_pausa_senal_s', v.pausa, actor.id);
        await cambiarAjuste('gps_modo', v.modo, actor.id);
        notificar('Configuración GPS guardada');
      } catch (e) {
        avisar('Error', mensajeError(e), 'error');
      }
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Configuración GPS' }} />
      <Tarjeta>
        <Seccion titulo="Estado del dispositivo">
          <DatoFila etiqueta="Permiso de ubicación (en uso)" valor={PERMISO[st.permisoPrimerPlano]} />
          <DatoFila etiqueta="Permiso en segundo plano («siempre»)" valor={PERMISO[st.permisoSegundoPlano]} />
          <DatoFila etiqueta="Servicios de ubicación" valor={st.serviciosActivos == null ? 'Desconocido' : st.serviciosActivos ? 'Activados' : 'Desactivados'} tono={st.serviciosActivos === false ? 'peligro' : undefined} />
        </Seccion>
        <Boton titulo="Actualizar estado" variante="secundario" compacto onPress={() => void gps.consultarPermisos()} />
        <Boton
          titulo="Permitir captura en segundo plano"
          compacto
          estilo={{ marginTop: espacio.sm }}
          cargando={ocupado}
          onPress={() => ejecutar(async () => { const ok = await gps.habilitarSegundoPlano(); avisar('Segundo plano', ok ? 'Permiso concedido.' : 'Permiso no concedido. La captura funcionará solo con la app abierta.'); })}
        />
        <Text style={[tipo.nota, { marginTop: espacio.sm }]}>
          En Android 11+ el sistema abre sus ajustes para elegir «Permitir todo el tiempo». Se muestra una notificación persistente mientras se captura. Si el sistema
          operativo cierra la app, la captura puede detenerse: se registrará como interrupción.
        </Text>
      </Tarjeta>
      <Tarjeta>
        <Seccion titulo="Parámetros de captura (configuración inicial ~5–10 s o 5–10 m)">
          <Campo etiqueta="Intervalo de muestreo" value={v.intervalo} onChangeText={(t) => setV({ ...v, intervalo: t })} keyboardType="number-pad" unidad="s" error={err.intervalo} />
          <Campo etiqueta="Distancia mínima" value={v.distancia} onChangeText={(t) => setV({ ...v, distancia: t })} keyboardType="number-pad" unidad="m" error={err.distancia} />
          <Campo etiqueta="Descartar lecturas con precisión peor que" value={v.precision} onChangeText={(t) => setV({ ...v, precision: t })} keyboardType="number-pad" unidad="m" error={err.precision} />
          <Campo etiqueta="Pérdida de señal que abre nuevo segmento" value={v.pausa} onChangeText={(t) => setV({ ...v, pausa: t })} keyboardType="number-pad" unidad="s" error={err.pausa} />
          <Segmentado etiqueta="Modo de traslado por defecto" valor={v.modo} onCambio={(m) => setV({ ...v, modo: m })} opciones={[{ valor: 'A_PIE', texto: 'A pie (≤ 14 km/h)' }, { valor: 'VEHICULO', texto: 'Vehículo (≤ 144 km/h)' }]} />
        </Seccion>
        <Aviso tono="info" texto="Las lecturas con saltos incompatibles con el modo de traslado se descartan. La distancia mostrada es siempre una estimación." />
        <Boton titulo="Guardar" onPress={guardar} deshabilitado={!valido} cargando={ocupado} />
      </Tarjeta>
    </Pantalla>
  );
}
