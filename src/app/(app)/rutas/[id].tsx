import { Stack, useLocalSearchParams } from 'expo-router';
import { Download } from 'lucide-react-native';
import { Text } from 'react-native';
import { useAccion, useCarga, useConectividad } from '../../../components/hooks';
import { MapaRecorrido } from '../../../components/MapaRecorrido';
import { Aviso, Boton, Cargando, DatoFila, ErrorVista, Fila, Insignia, Pantalla, Rejilla, Kpi, Seccion, Tarjeta, avisar, confirmar } from '../../../components/ui';
import { formatearDistancia, formatearDuracion } from '../../../domain/stats';
import { fechaHora, hora } from '../../../domain/time';
import { compartirTexto } from '../../../platform/files';
import { puede } from '../../../security/permissions';
import { mensajeError } from '../../../services/contexto';
import { prepararGeojson } from '../../../services/exportService';
import { detalle, segmentosDe } from '../../../services/rutaService';
import { useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

const EVENTO: Record<string, string> = {
  INICIO: 'Inicio', PAUSA: 'Pausa', REANUDA: 'Reanudación (nuevo segmento)', FIN: 'Fin', PARADA: 'Parada',
  INTERRUPCION: 'Interrupción', PERDIDA_SENAL: 'Pérdida de señal (nuevo segmento)', REPOSICION: 'Reposicionamiento (nuevo segmento)',
  ERROR_GPS: 'Error de GPS', APP_EN_SEGUNDO_PLANO: 'App en segundo plano sin permiso', ATENCION: 'Atención registrada (sin datos del paciente)',
};

export default function DetalleRuta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { ajustes } = useApp();
  const red = useConectividad();
  const { ocupado, ejecutar } = useAccion();
  const { datos, error, recargar } = useCarga(() => detalle(db, actor, id), [id]);

  if (error) return <Pantalla><ErrorVista mensaje={error} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const { ruta, puntos, paradas, eventos, permanencias, resumen } = datos;
  const segs = segmentosDe(puntos);

  const exportar = (generalizada: boolean) =>
    ejecutar(async () => {
      try {
        if (!generalizada && !(await confirmar('Exportación sensible', 'El GeoJSON preciso permite identificar lugares recorridos. No lo comparta públicamente sin revisión.', { textoOk: 'Exportar' }))) return;
        const { contenido } = await prepararGeojson(db, actor, { rutaId: ruta.id, generalizada });
        await compartirTexto(`ruta-${ruta.id.slice(0, 8)}${generalizada ? '-generalizada' : ''}.geojson`, contenido, 'application/geo+json', 'Exportar recorrido');
      } catch (e) {
        avisar('No se pudo exportar', mensajeError(e), 'error');
      }
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Detalle del recorrido' }} />
      <Fila style={{ marginBottom: espacio.sm }}>
        <Insignia texto={ruta.estado} tono={ruta.estado === 'FINALIZADA' ? 'exito' : 'aviso'} />
        {ruta.origen === 'SINTETICO' ? <Insignia texto="DATOS SINTÉTICOS" tono="aviso" /> : null}
        <Insignia texto={ruta.modo_traslado === 'A_PIE' ? 'A pie' : 'Vehículo'} />
      </Fila>
      <MapaRecorrido
        segmentos={segs}
        paradas={[
          ...permanencias.map((p) => ({ id: `auto-${p.inicioMs}`, lat: p.lat, lon: p.lon, etiqueta: p.tipo, tipo: p.tipo, atenciones: p.atenciones })),
          ...paradas.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, etiqueta: p.etiqueta, tipo: 'MANUAL' as const })),
        ]}
        finalizado={ruta.estado === 'FINALIZADA'}
        teselas={{ habilitadas: ajustes.mapa_teselas === '1', url: ajustes.mapa_url, enLinea: red === 'EN_LINEA' }}
      />
      <Rejilla>
        <Kpi etiqueta="Distancia estimada" valor={formatearDistancia(ruta.distancia_m)} tono="acento" />
        <Kpi etiqueta="Duración activa" valor={formatearDuracion(ruta.activo_ms)} tono="acento" />
        <Kpi etiqueta="Segmentos" valor={String(segs.length)} tono="acento" />
        <Kpi etiqueta="Puntos de brigada" valor={String(resumen.puntosBrigada)} detalle={`${resumen.atenciones} atenciones`} tono="exito" />
        <Kpi etiqueta="Tiempo en brigada" valor={formatearDuracion(resumen.brigadaMs)} tono="exito" />
        <Kpi etiqueta="En movimiento" valor={formatearDuracion(resumen.movimientoMs)} tono="acento" />
        <Kpi etiqueta="Detenido (sin atenciones)" valor={formatearDuracion(resumen.paradaMs)} detalle={`${resumen.paradas} detenciones`} />
      </Rejilla>
      <Tarjeta style={{ marginTop: espacio.sm }}>
        <DatoFila etiqueta="Inicio" valor={fechaHora(ruta.inicio_ms)} />
        <DatoFila etiqueta="Fin" valor={fechaHora(ruta.fin_ms)} />
        <DatoFila etiqueta="Duración total (incluye pausas)" valor={ruta.fin_ms ? formatearDuracion(ruta.fin_ms - ruta.inicio_ms) : '—'} />
        <DatoFila etiqueta="Puntos válidos" valor={String(puntos.length)} />
        <DatoFila etiqueta="Precisión media" valor={puntos.length ? `± ${Math.round(puntos.reduce((a, p) => a + (p.precision_m ?? 0), 0) / puntos.length)} m` : '—'} />
      </Tarjeta>

      <Seccion titulo="Actividad detectada">
        {permanencias.length === 0 ? (
          <Text style={tipo.nota}>Sin detenciones de 3 minutos o más ni puntos de brigada.</Text>
        ) : (
          <Tarjeta>
            {permanencias.map((p) => (
              <DatoFila
                key={p.inicioMs}
                etiqueta={`${hora(p.inicioMs)} – ${hora(p.finMs)} · ${formatearDuracion(p.duracionMs)}`}
                valor={p.tipo === 'BRIGADA' ? `Brigada · ${p.atenciones} atención(es)` : 'Detenido'}
              />
            ))}
          </Tarjeta>
        )}
        <Text style={[tipo.nota, { marginTop: 4 }]}>Detección automática: permanencia en un radio de 40 m. Es brigada si durante ella se guardaron atenciones.</Text>
      </Seccion>

      <Seccion titulo="Eventos">
        <Tarjeta>
          {eventos.map((e) => <DatoFila key={e.id} etiqueta={hora(e.fecha_ms)} valor={`${EVENTO[e.tipo] ?? e.tipo}${e.detalle && e.tipo === 'PARADA' ? ` · ${e.detalle}` : ''}`} />)}
        </Tarjeta>
      </Seccion>

      {puede(actor.rol, 'exportar.geojson') ? (
        <Seccion titulo="Exportar (GeoJSON)">
          <Aviso tono="info" texto="La exportación GPS se considera sensible. Use la versión generalizada (~110 m) para informes académicos." />
          <Fila>
            <Boton titulo="Generalizada" icono={Download} onPress={() => exportar(true)} cargando={ocupado} estilo={{ flex: 1 }} />
            <Boton titulo="Precisa" icono={Download} variante="secundario" onPress={() => exportar(false)} deshabilitado={ocupado} estilo={{ flex: 1 }} />
          </Fila>
        </Seccion>
      ) : null}
      <Text style={[tipo.nota, { textAlign: 'center', marginTop: espacio.md }]}>Las coordenadas corresponden al dispositivo del equipo; no se asocian a pacientes.</Text>
    </Pantalla>
  );
}
