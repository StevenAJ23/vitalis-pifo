import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  CalendarDays, ChevronRight, ClipboardList, Clock, Flag, History, MapPin, Navigation, Play, Route, Search, Stethoscope, TriangleAlert, Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useCarga, useDuracionActiva } from '../../../components/hooks';
import { TarjetaAtencion } from '../../../components/TarjetaAtencion';
import { Boton, Cargando, ErrorVista, Kpi, Pantalla, Rejilla, Seccion, Tarjeta, Vacio } from '../../../components/ui';
import { formatearDistancia, formatearDuracion, formatearNumero, formatearSegundos, porcentaje } from '../../../domain/stats';
import { fechaCorta } from '../../../domain/time';
import { puede } from '../../../security/permissions';
import * as atencionService from '../../../services/atencionService';
import { gpsStore } from '../../../services/gpsIngesta';
import * as stats from '../../../services/statsService';
import { useActor, useApp, useDb } from '../../../state/app';
import { useStore } from '../../../state/store';
import { colores, espacio, radio, tipo, useResponsive } from '../../../theme';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function saludoYFecha() {
  const d = new Date();
  const h = d.getHours();
  return {
    saludo: h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches',
    fecha: `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`,
  };
}

function Accion({ icono: Icono, titulo, detalle, color, fondo, onPress }: { icono: LucideIcon; titulo: string; detalle: string; color: string; fondo: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [estilos.accion, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={titulo}>
      <View style={[estilos.accionIcono, { backgroundColor: fondo }]}>
        <Icono size={24} color={color} />
      </View>
      <Text style={estilos.accionTitulo} numberOfLines={1}>{titulo}</Text>
      <Text style={tipo.nota} numberOfLines={1}>{detalle}</Text>
    </Pressable>
  );
}

export default function Inicio() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const gps = useStore(gpsStore);
  const msRuta = useDuracionActiva(gps.ruta);
  const { tablet } = useResponsive();
  const [{ saludo, fecha }] = useState(saludoYFecha);
  const verHistorial = puede(actor.rol, 'historial.ver');
  const { datos, error, cargando, recargar } = useCarga(async () => {
    const dash = await stats.dashboard(db, actor, campanaActiva?.id ?? null);
    const ultimas = verHistorial ? await atencionService.historial(db, actor, { campanaId: campanaActiva?.id ?? null, limite: 4 }) : [];
    return { dash, ultimas };
  }, [campanaActiva?.id, gps.puntosVersion]);

  const acciones: { clave: string; icono: LucideIcon; titulo: string; detalle: string; color: string; fondo: string; onPress: () => void }[] = [];
  if (campanaActiva && puede(actor.rol, 'atencion.crear')) {
    acciones.push({ clave: 'atencion', icono: Stethoscope, titulo: 'Nueva atención', detalle: 'Registrar signos', color: '#FFFFFF', fondo: colores.primario, onPress: () => router.push('/atencion/nueva') });
  }
  if (puede(actor.rol, 'paciente.buscar')) {
    acciones.push({ clave: 'buscar', icono: Search, titulo: 'Buscar paciente', detalle: 'Código o nombre', color: colores.info, fondo: colores.infoSuave, onPress: () => router.navigate('/pacientes') });
  }
  if (campanaActiva && puede(actor.rol, 'ruta.capturar')) {
    acciones.push({
      clave: 'ruta', icono: gps.ruta ? Navigation : Play, titulo: gps.ruta ? 'Ver recorrido' : 'Iniciar ruta',
      detalle: gps.ruta ? `${formatearDuracion(msRuta)} · ${formatearDistancia(gps.ruta.distancia_m)}` : 'GPS del equipo',
      color: colores.acento, fondo: colores.acentoSuave, onPress: () => router.navigate('/recorrido'),
    });
  }
  if (verHistorial) {
    acciones.push({ clave: 'historial', icono: History, titulo: 'Historial', detalle: 'Por fecha y sector', color: '#6941C6', fondo: '#F4EBFF', onPress: () => router.push('/historial') });
  }

  return (
    <Pantalla refrescar={<RefreshControl refreshing={cargando && !!datos} onRefresh={recargar} />}>
      <View style={estilos.hero}>
        <Text style={estilos.heroSaludo}>{saludo}, {actor.nombre.split(' ')[0]}</Text>
        <Text style={estilos.heroFecha}>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</Text>
        {campanaActiva ? (
          <Pressable onPress={() => router.push('/campanas')} style={estilos.heroCampana} accessibilityRole="button" accessibilityLabel="Cambiar campaña">
            <Flag size={16} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={estilos.heroCampanaNombre} numberOfLines={1}>{campanaActiva.nombre}</Text>
              <Text style={estilos.heroCampanaDet} numberOfLines={1}>
                {campanaActiva.sector} · {fechaCorta(campanaActiva.inicio)}{campanaActiva.fin ? ` – ${fechaCorta(campanaActiva.fin)}` : ''}
              </Text>
            </View>
            <ChevronRight size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
        {datos ? (
          <View style={estilos.heroCifras}>
            <Cifra valor={String(datos.dash.atencionesHoy)} etiqueta="Atenciones hoy" />
            <Cifra valor={String(datos.dash.pacientesUnicos)} etiqueta="Pacientes" />
            <Cifra valor={String(datos.dash.puntosBrigada)} etiqueta="Puntos de brigada" />
          </View>
        ) : null}
      </View>

      {!campanaActiva ? (
        <Tarjeta>
          <Vacio
            icono={Flag}
            titulo="Seleccione una campaña activa"
            mensaje="Las atenciones y los recorridos se registran dentro de una campaña."
            accion={<Boton titulo={puede(actor.rol, 'campana.gestionar') ? 'Gestionar campañas' : 'Elegir campaña'} onPress={() => router.push('/campanas')} />}
          />
        </Tarjeta>
      ) : null}

      {acciones.length > 0 ? (
        <View style={estilos.acciones}>
          {acciones.map(({ clave, ...a }) => (
            <View key={clave} style={{ width: tablet ? '25%' : '50%', padding: 5 }}>
              <Accion {...a} />
            </View>
          ))}
        </View>
      ) : null}

      {gps.ruta?.estado === 'INTERRUMPIDA' ? (
        <Pressable onPress={() => router.navigate('/recorrido')} style={[estilos.alerta, { backgroundColor: colores.peligroSuave }]} accessibilityRole="button">
          <TriangleAlert size={20} color={colores.peligro} />
          <Text style={[tipo.cuerpo, { flex: 1, color: colores.peligro }]}>Recorrido interrumpido: toque para reanudarlo o finalizarlo.</Text>
        </Pressable>
      ) : null}

      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : (
        <>
          {datos.dash.pendientesRevision > 0 && puede(actor.rol, 'atencion.revisar') ? (
            <Pressable onPress={() => router.push({ pathname: '/historial', params: { revision: '1' } })} style={[estilos.alerta, { backgroundColor: colores.avisoSuave }]} accessibilityRole="button">
              <TriangleAlert size={20} color={colores.aviso} />
              <Text style={[tipo.cuerpo, { flex: 1, color: colores.aviso }]}>
                {datos.dash.pendientesRevision} atención(es) con valores atípicos esperan revisión médica.
              </Text>
              <ChevronRight size={18} color={colores.aviso} />
            </Pressable>
          ) : null}

          {verHistorial ? (
            <Seccion titulo="Últimas atenciones" accion={datos.ultimas.length ? <Boton titulo="Ver todas" variante="fantasma" compacto onPress={() => router.push('/historial')} /> : undefined}>
              {datos.ultimas.length === 0 ? (
                <Tarjeta><Text style={tipo.secundario}>Aún no hay atenciones en esta campaña.</Text></Tarjeta>
              ) : (
                datos.ultimas.map((a) => <TarjetaAtencion key={a.id} a={a} mostrarPaciente />)
              )}
            </Seccion>
          ) : null}

          <Seccion titulo="Resumen de la campaña">
            <Rejilla>
              <Kpi etiqueta="Atenciones" valor={String(datos.dash.atenciones)} icono={Stethoscope} />
              <Kpi etiqueta="Sectores" valor={String(datos.dash.sectores)} icono={MapPin} />
              <Kpi etiqueta="Con seguimiento" valor={String(datos.dash.seguimiento)} icono={ClipboardList} />
              <Kpi etiqueta="Pacientes únicos" valor={String(datos.dash.pacientesUnicos)} icono={Users} />
            </Rejilla>
          </Seccion>

          <Seccion titulo="Registro digital">
            <Rejilla>
              <Kpi etiqueta="Tiempo medio de registro" valor={formatearSegundos(datos.dash.registroMedioS)} detalle={`${datos.dash.registrosMedidos} registros`} icono={Clock} tono="info" />
              <Kpi etiqueta="Mediana de registro" valor={formatearSegundos(datos.dash.registroMedianaS)} icono={Clock} tono="info" />
              <Kpi
                etiqueta="Mediciones faltantes"
                valor={datos.dash.camposPosibles ? `${formatearNumero(porcentaje(datos.dash.camposFaltantes, datos.dash.camposPosibles), 0)} %` : '—'}
                detalle={`${datos.dash.camposFaltantes} campos`}
                icono={ClipboardList}
                tono="info"
              />
            </Rejilla>
          </Seccion>

          <Seccion titulo="Recorridos del equipo">
            <Rejilla>
              <Kpi etiqueta="Distancia (estimada)" valor={formatearDistancia(datos.dash.distanciaM)} icono={Route} tono="acento" />
              <Kpi etiqueta="Tiempo en brigada" valor={formatearDuracion(datos.dash.brigadaMs)} detalle={`${datos.dash.puntosBrigada} puntos`} icono={Stethoscope} tono="exito" />
              <Kpi etiqueta="En movimiento" valor={formatearDuracion(datos.dash.movimientoMs)} detalle={`Detenido ${formatearDuracion(datos.dash.paradaMs)}`} icono={Navigation} tono="acento" />
              <Kpi etiqueta="Rutas" valor={String(datos.dash.rutas)} icono={CalendarDays} tono="acento" />
            </Rejilla>
          </Seccion>
          <Text style={[tipo.nota, { textAlign: 'center' }]}>Indicadores calculados en vivo desde la base local cifrada.</Text>
        </>
      )}
    </Pantalla>
  );
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={estilos.cifraValor}>{valor}</Text>
      <Text style={estilos.cifraEtiqueta} numberOfLines={1}>{etiqueta}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  hero: { backgroundColor: colores.primario, borderRadius: 22, padding: espacio.lg, marginBottom: espacio.md },
  heroSaludo: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  heroFecha: { color: '#CFE6E2', fontSize: 14, marginTop: 2 },
  heroCampana: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.sm, marginTop: espacio.md, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radio.md, paddingHorizontal: espacio.md, paddingVertical: 10,
  },
  heroCampanaNombre: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  heroCampanaDet: { color: '#CFE6E2', fontSize: 12 },
  heroCifras: { flexDirection: 'row', marginTop: espacio.md, paddingTop: espacio.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  cifraValor: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cifraEtiqueta: { color: '#CFE6E2', fontSize: 11 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: espacio.md },
  accion: { backgroundColor: colores.superficie, borderRadius: 18, padding: espacio.md, borderWidth: 1, borderColor: colores.borde, minHeight: 112, gap: 4 },
  accionIcono: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  accionTitulo: { ...tipo.cuerpo, fontWeight: '700' },
  alerta: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.md, borderRadius: radio.md, marginBottom: espacio.md },
});
