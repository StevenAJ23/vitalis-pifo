import { router } from 'expo-router';
import { ClipboardList, Download, Route } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccion, useCarga } from '../../../components/hooks';
import { Aviso, Barras, Boton, Cargando, DatoFila, ErrorVista, Fila, Kpi, Pantalla, Rejilla, Seccion, Segmentado, Tarjeta } from '../../../components/ui';
import { formatearDistancia, formatearDuracion, formatearNumero, formatearSegundos } from '../../../domain/stats';
import { compartirTexto } from '../../../platform/files';
import { puede } from '../../../security/permissions';
import { mensajeError } from '../../../services/contexto';
import * as evaluacion from '../../../services/evaluacionService';
import { prepararCsvMatriz, prepararCsvSesiones } from '../../../services/exportService';
import * as stats from '../../../services/statsService';
import { useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo, useResponsive } from '../../../theme';

const NOMBRE_METODO = { DIGITAL: 'Digital (app)', PAPEL: 'Papel', EXCEL: 'Excel' } as const;

export default function Estadisticas() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const { tablet } = useResponsive();
  const [alcance, setAlcance] = useState<'CAMPANA' | 'TODAS'>(campanaActiva ? 'CAMPANA' : 'TODAS');
  const campanaId = alcance === 'CAMPANA' ? campanaActiva?.id ?? null : null;
  const [aviso, setAviso] = useState<string | null>(null);
  const { ocupado, ejecutar } = useAccion();
  const clinicas = puede(actor.rol, 'estadisticas.clinicas');

  const { datos, error, recargar } = useCarga(async () => {
    const [dash, cli, ev] = await Promise.all([
      stats.dashboard(db, actor, campanaId),
      clinicas ? stats.clinicas(db, actor, campanaId) : Promise.resolve(null),
      evaluacion.resumen(db, actor, campanaId),
    ]);
    return { dash, cli, ev };
  }, [campanaId, clinicas]);

  const exportar = (tipoCsv: 'matriz' | 'sesiones') =>
    ejecutar(async () => {
      setAviso(null);
      try {
        const r = tipoCsv === 'matriz' ? await prepararCsvMatriz(db, actor, campanaId) : await prepararCsvSesiones(db, actor, campanaId);
        await compartirTexto(`vitalis-${tipoCsv}-${new Date().toISOString().slice(0, 10)}.csv`, r.contenido, 'text/csv', 'Exportar métricas académicas');
      } catch (e) {
        setAviso(mensajeError(e));
      }
    });

  return (
    <Pantalla>
      {campanaActiva ? (
        <Segmentado valor={alcance} onCambio={setAlcance} opciones={[{ valor: 'CAMPANA', texto: campanaActiva.nombre }, { valor: 'TODAS', texto: 'Todas las campañas' }]} />
      ) : null}
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : (
        <>
          <Seccion titulo="Resumen">
            <Rejilla>
              <Kpi etiqueta="Pacientes únicos" valor={String(datos.dash.pacientesUnicos)} />
              <Kpi etiqueta="Atenciones" valor={String(datos.dash.atenciones)} />
              <Kpi etiqueta="Sectores" valor={String(datos.dash.sectores)} />
              <Kpi etiqueta="Seguimiento" valor={String(datos.dash.seguimiento)} />
            </Rejilla>
          </Seccion>

          {datos.cli ? (
            <View style={{ flexDirection: tablet ? 'row' : 'column', gap: espacio.md }}>
              <View style={{ flex: 1 }}>
                <Tarjeta>
                  <Seccion titulo="Atenciones por sector"><Barras datos={datos.cli.porSector} /></Seccion>
                </Tarjeta>
                <Tarjeta>
                  <Seccion titulo="Atenciones por día"><Barras datos={datos.cli.porDia} /></Seccion>
                </Tarjeta>
              </View>
              <View style={{ flex: 1 }}>
                <Tarjeta>
                  <Seccion titulo="IMC (kg/m²)"><Barras datos={datos.cli.imc} vacio="Sin IMC calculado" /></Seccion>
                  <Text style={tipo.nota}>Agregado descriptivo; no constituye diagnóstico.</Text>
                </Tarjeta>
                <Tarjeta>
                  <Seccion titulo="Mediciones faltantes por campo"><Barras datos={datos.cli.faltantesPorCampo} vacio="Sin faltantes" /></Seccion>
                </Tarjeta>
                <Tarjeta>
                  <Seccion titulo="Tapón de cerumen (oídos evaluados)"><Barras datos={datos.cli.oidos} /></Seccion>
                </Tarjeta>
              </View>
            </View>
          ) : (
            <Aviso tono="info" texto="Su rol accede solo a métricas académicas desidentificadas." />
          )}

          <Seccion titulo="Recorridos GPS">
            <Rejilla>
              <Kpi etiqueta="Rutas" valor={String(datos.dash.rutas)} icono={Route} tono="acento" />
              <Kpi etiqueta="Distancia estimada" valor={formatearDistancia(datos.dash.distanciaM)} tono="acento" />
              <Kpi etiqueta="Duración activa" valor={formatearDuracion(datos.dash.activoMs)} tono="acento" />
              <Kpi etiqueta="Puntos de brigada" valor={String(datos.dash.puntosBrigada)} detalle={`${formatearDuracion(datos.dash.brigadaMs)} en brigada`} tono="exito" />
              <Kpi etiqueta="En movimiento" valor={formatearDuracion(datos.dash.movimientoMs)} detalle={`Detenido ${formatearDuracion(datos.dash.paradaMs)}`} tono="acento" />
            </Rejilla>
            {puede(actor.rol, 'ruta.ver') ? <Boton titulo="Ver recorridos" variante="fantasma" onPress={() => router.push('/rutas/historial')} /> : null}
          </Seccion>

          <Seccion titulo="Evaluación del piloto (métricas académicas)">
            <Text style={[tipo.nota, { marginBottom: espacio.sm }]}>
              Separadas de los datos clínicos. Errores de validación (detectados por la app) se cuentan aparte de los errores verificados contra la ficha fuente.
            </Text>
            <View style={{ flexDirection: tablet ? 'row' : 'column', gap: espacio.sm }}>
              {datos.ev.porMetodo.map((m) => (
                <Tarjeta key={m.metodo} style={{ flex: tablet ? 1 : undefined }}>
                  <Text style={tipo.subtitulo}>{NOMBRE_METODO[m.metodo]}</Text>
                  <DatoFila etiqueta="Registros" valor={`${m.n} (${formatearNumero(m.tasaExito, 0)} % guardados)`} />
                  <DatoFila etiqueta="Tiempo medio / mediana" valor={`${formatearSegundos(m.tiempoMedio)} / ${formatearSegundos(m.tiempoMediana)}`} />
                  <DatoFila etiqueta="Búsqueda media" valor={formatearSegundos(m.busquedaMedia)} />
                  <DatoFila etiqueta="Errores de validación" valor={String(m.erroresValidacion)} />
                  <DatoFila etiqueta="Errores verificados" valor={m.verificados ? `${m.erroresVerificados} en ${m.verificados} verificados` : 'sin verificar'} />
                  <DatoFila etiqueta="Faltantes por registro" valor={formatearNumero(m.faltantesMedia)} />
                  <DatoFila etiqueta="Correcciones" valor={String(m.correcciones)} />
                  <DatoFila etiqueta="Sin conexión" valor={String(m.sinConexion)} />
                  <DatoFila etiqueta="Satisfacción (1–5)" valor={formatearNumero(m.satisfaccionMedia)} />
                  <DatoFila etiqueta="Consolidación media" valor={formatearSegundos(m.consolidacionMediaS)} />
                </Tarjeta>
              ))}
            </View>
            <Text style={[tipo.nota, { marginVertical: espacio.sm }]}>Meta práctica: 30 registros por grupo (no garantiza muestra representativa).</Text>
            {puede(actor.rol, 'evaluacion.gestionar') ? (
              <Boton titulo="Gestionar evaluación del piloto" icono={ClipboardList} variante="secundario" onPress={() => router.push('/evaluacion')} estilo={{ marginBottom: espacio.sm }} />
            ) : null}
            {puede(actor.rol, 'exportar.metricas') ? (
              <Fila>
                <Boton titulo="CSV matriz" icono={Download} onPress={() => exportar('matriz')} cargando={ocupado} estilo={{ flex: 1 }} />
                <Boton titulo="CSV satisfacción" icono={Download} variante="secundario" onPress={() => exportar('sesiones')} deshabilitado={ocupado} estilo={{ flex: 1 }} />
              </Fila>
            ) : null}
            {aviso ? <Aviso tono="peligro" texto={aviso} /> : null}
          </Seccion>
        </>
      )}
    </Pantalla>
  );
}
