import { router, Stack } from 'expo-router';
import { Download, Route } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccion, useCarga } from '../../../components/hooks';
import { Boton, Cargando, ErrorVista, Fila, Insignia, Interruptor, Pantalla, Tarjeta, Vacio, avisar } from '../../../components/ui';
import { formatearDistancia, formatearDuracion } from '../../../domain/stats';
import { fechaHora } from '../../../domain/time';
import { compartirTexto } from '../../../platform/files';
import { puede } from '../../../security/permissions';
import { mensajeError } from '../../../services/contexto';
import { prepararGeojson } from '../../../services/exportService';
import { listar } from '../../../services/rutaService';
import { useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

export default function HistorialRutas() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const [soloCampana, setSoloCampana] = useState(!!campanaActiva);
  const { ocupado, ejecutar } = useAccion();
  const { datos, error, recargar } = useCarga(() => listar(db, actor, soloCampana ? campanaActiva?.id : null), [soloCampana, campanaActiva?.id]);

  const exportarTodo = () =>
    ejecutar(async () => {
      try {
        const { contenido, rutas } = await prepararGeojson(db, actor, { campanaId: soloCampana ? campanaActiva?.id ?? null : null, generalizada: true });
        await compartirTexto(`rutas-campana-generalizadas.geojson`, contenido, 'application/geo+json', `Exportar ${rutas} recorridos`);
      } catch (e) {
        avisar('No se pudo exportar', mensajeError(e), 'error');
      }
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Recorridos anteriores' }} />
      {campanaActiva ? <Interruptor etiqueta={`Solo campaña «${campanaActiva.nombre}»`} valor={soloCampana} onCambio={setSoloCampana} /> : null}
      {puede(actor.rol, 'exportar.geojson') && (datos?.length ?? 0) > 0 ? (
        <Boton titulo="Exportar todas (GeoJSON generalizado)" icono={Download} variante="secundario" onPress={exportarTodo} cargando={ocupado} estilo={{ marginBottom: espacio.md }} />
      ) : null}
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : datos.length === 0 ? (
        <Vacio icono={Route} titulo="Sin recorridos" mensaje="Los recorridos finalizados aparecerán aquí." />
      ) : (
        datos.map((r) => (
          <Tarjeta key={r.id} onPress={() => router.push({ pathname: '/rutas/[id]', params: { id: r.id } })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={tipo.subtitulo}>{fechaHora(r.inicio_ms)}</Text>
              <Text style={[tipo.subtitulo, { color: '#E2702B' }]}>{formatearDistancia(r.distancia_m)}</Text>
            </View>
            <Text style={tipo.secundario}>{r.campana_nombre} · {r.usuario_nombre ?? '—'}</Text>
            <Text style={tipo.nota}>{formatearDuracion(r.activo_ms)} activos · {r.n_segmentos} segmentos · {r.n_puntos} puntos</Text>
            <Fila style={{ marginTop: 6 }}>
              <Insignia texto={r.estado} tono={r.estado === 'FINALIZADA' ? 'exito' : 'aviso'} />
              {r.origen === 'SINTETICO' ? <Insignia texto="SINTÉTICO" tono="aviso" /> : null}
            </Fila>
          </Tarjeta>
        ))
      )}
    </Pantalla>
  );
}
