import { router } from 'expo-router';
import { Flag, Footprints, History, Navigation, Pause, Play, Satellite, Square, Stethoscope, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAccion, useConectividad, useDuracionActiva, useReloj } from '../../../components/hooks';
import { MapaRecorrido } from '../../../components/MapaRecorrido';
import { Aviso, Boton, DatoFila, Fila, Insignia, Pantalla, Segmentado, Tarjeta, avisar, confirmar } from '../../../components/ui';
import type { ModoTraslado } from '../../../domain/gpsFilter';
import { formatearDistancia, formatearDuracion } from '../../../domain/stats';
import { hora } from '../../../domain/time';
import { estadoActual } from '../../../domain/permanencias';
import type { RutaEvento, RutaPunto } from '../../../domain/types';
import * as rutasRepo from '../../../repositories/rutas';
import { puede } from '../../../security/permissions';
import { ErrorNegocio, mensajeError } from '../../../services/contexto';
import * as gps from '../../../services/gps';
import { gpsStore } from '../../../services/gpsIngesta';
import { calcularActividad, segmentosDe } from '../../../services/rutaService';
import { useActor, useApp, useDb } from '../../../state/app';
import { useStore } from '../../../state/store';
import { colores, espacio, tipo, useResponsive } from '../../../theme';

const SENAL = { OK: 'Señal buena', DEBIL: 'Señal débil', SIN_SENAL: 'Sin señal', BUSCANDO: 'Buscando señal…' } as const;

export default function Recorrido() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva, ajustes } = useApp();
  const st = useStore(gpsStore);
  const ruta = st.ruta;
  const ms = useDuracionActiva(ruta);
  const red = useConectividad();
  const { tablet } = useResponsive();
  const { ocupado, ejecutar } = useAccion();
  const [modo, setModo] = useState<ModoTraslado>((ajustes.gps_modo as ModoTraslado) || 'A_PIE');
  const [puntos, setPuntos] = useState<RutaPunto[]>([]);
  const [eventos, setEventos] = useState<RutaEvento[]>([]);
  // Refresco periódico: las marcas de atención llegan desde otra pantalla.
  const tick = useReloj(ruta?.estado === 'EN_CURSO', 20_000);
  const capturar = puede(actor.rol, 'ruta.capturar');

  useEffect(() => {
    if (!ruta) return; // sin ruta la pantalla no muestra puntos
    let vivo = true;
    void Promise.all([rutasRepo.puntos(db, ruta.id), rutasRepo.eventos(db, ruta.id)]).then(([p, ev]) => {
      if (vivo) {
        setPuntos(p);
        setEventos(ev);
      }
    });
    return () => {
      vivo = false;
    };
  }, [db, ruta?.id, st.puntosVersion, ruta?.estado, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const accion = (fn: () => Promise<unknown>) =>
    ejecutar(async () => {
      try {
        await fn();
      } catch (e) {
        avisar('Recorrido', mensajeError(e), 'error');
      }
    });

  const iniciar = () =>
    accion(async () => {
      if (!campanaActiva) throw new ErrorNegocio('Seleccione una campaña activa antes de iniciar.');
      await gps.iniciarRecorrido(actor, campanaActiva.id, modo);
    });

  const finalizar = () =>
    accion(async () => {
      if (!(await confirmar('Finalizar recorrido', 'Se detendrá la captura GPS y el recorrido quedará cerrado.', { textoOk: 'Finalizar' }))) return;
      const r = await gps.finalizarRecorrido(actor);
      if (r) router.push({ pathname: '/rutas/[id]', params: { id: r.id } });
    });

  const teselas = { habilitadas: ajustes.mapa_teselas === '1', url: ajustes.mapa_url, enLinea: red === 'EN_LINEA' };

  if (!ruta) {
    return (
      <Pantalla>
        <Tarjeta>
          <View style={{ alignItems: 'center', paddingVertical: espacio.md }}>
            <View style={estilos.iconoGrande}><Navigation size={34} color={colores.acento} /></View>
            <Text style={tipo.titulo}>Recorrido de campaña</Text>
            <Text style={[tipo.secundario, { textAlign: 'center', marginTop: 4 }]}>
              Registra la ruta del equipo, no la de los pacientes. Inicio y fin explícitos; puede denegar el permiso sin afectar la atención.
            </Text>
          </View>
          {campanaActiva ? (
            <>
              <Text style={[tipo.etiqueta, { marginBottom: 6 }]}>Campaña: {campanaActiva.nombre}</Text>
              <Segmentado etiqueta="Modo de traslado" valor={modo} onCambio={setModo} opciones={[{ valor: 'A_PIE', texto: 'A pie' }, { valor: 'VEHICULO', texto: 'Vehículo' }]} />
              {capturar ? (
                <Boton titulo="Iniciar recorrido" icono={Play} variante="acento" grande onPress={iniciar} cargando={ocupado} />
              ) : (
                <Aviso tono="info" texto="Su rol puede consultar recorridos, pero no iniciarlos." />
              )}
            </>
          ) : (
            <Aviso texto="Seleccione una campaña activa para iniciar un recorrido." accion={<Boton titulo="Campañas" compacto variante="secundario" onPress={() => router.push('/campanas')} />} />
          )}
        </Tarjeta>
        {st.permisoPrimerPlano === 'denegado' ? <Aviso tono="peligro" texto="El permiso de ubicación está denegado. Puede habilitarlo en Ajustes del sistema si desea registrar recorridos." /> : null}
        <Boton titulo="Recorridos anteriores" icono={History} variante="secundario" onPress={() => router.push('/rutas/historial')} />
      </Pantalla>
    );
  }

  const enCurso = ruta.estado === 'EN_CURSO';
  const segmentos = segmentosDe(puntos);
  const ult = st.ultimaLectura;
  const { permanencias, resumen } = calcularActividad(ruta, puntos, eventos, tick);
  const actividad = enCurso
    ? estadoActual(puntos.map((p) => ({ lat: p.lat, lon: p.lon, fechaMs: p.fecha_ms, segmento: p.segmento })), eventos.filter((e) => e.tipo === 'ATENCION').map((e) => e.fecha_ms), tick)
    : null;

  return (
    <Pantalla>
      <View style={[estilos.cabecera, { backgroundColor: enCurso ? colores.acento : ruta.estado === 'PAUSADA' ? colores.textoSec : colores.peligro }]}>
        <Text style={estilos.estado}>
          {enCurso ? (actividad === 'BRIGADA' ? 'EN BRIGADA · TOMANDO SIGNOS' : actividad === 'DETENIDO' ? 'EN CURSO · DETENIDO' : 'EN CURSO · EN MOVIMIENTO') : ruta.estado === 'PAUSADA' ? 'PAUSADO' : 'INTERRUMPIDO'}
        </Text>
        <Text style={estilos.crono} accessibilityLabel={`Duración activa ${formatearDuracion(ms)}`}>{formatearDuracion(ms)}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: espacio.sm }}>
          <Metrica etiqueta="Distancia estimada" valor={formatearDistancia(ruta.distancia_m)} />
          <Metrica etiqueta="Precisión" valor={ult?.precision != null ? `± ${Math.round(ult.precision)} m` : '—'} />
          <Metrica etiqueta="Puntos" valor={String(puntos.length)} />
        </View>
      </View>

      <Fila style={{ marginBottom: espacio.md }}>
        <Insignia texto={SENAL[st.senal]} icono={Satellite} tono={st.senal === 'OK' ? 'exito' : st.senal === 'DEBIL' ? 'aviso' : st.senal === 'SIN_SENAL' ? 'peligro' : 'neutro'} />
        {st.modoCaptura ? <Insignia texto={st.modoCaptura === 'SEGUNDO_PLANO' ? 'Captura en segundo plano' : 'Solo primer plano'} tono={st.modoCaptura === 'SEGUNDO_PLANO' ? 'exito' : 'aviso'} /> : null}
        {st.serviciosActivos === false ? <Insignia texto="Ubicación desactivada" tono="peligro" /> : null}
        <Insignia texto={`Última lectura ${hora(ult?.fechaMs)}`} />
        <Insignia texto={red === 'EN_LINEA' ? 'Con internet' : 'Sin internet'} tono={red === 'EN_LINEA' ? 'info' : 'neutro'} />
      </Fila>

      {st.error ? <Aviso tono="peligro" texto={st.error} /> : null}
      {ruta.estado === 'INTERRUMPIDA' ? (
        <Aviso tono="peligro" icono={TriangleAlert} texto="La captura se interrumpió (la app se cerró o el sistema la detuvo). Reanude para abrir un nuevo segmento o finalice el recorrido. No se inventan posiciones del periodo sin captura." />
      ) : null}
      {enCurso && st.modoCaptura === 'PRIMER_PLANO' ? (
        <Aviso
          texto="La captura continúa mientras la app esté abierta (también en otros módulos). Para seguir con la pantalla bloqueada, permita la ubicación «siempre»."
          accion={<Boton titulo="Permitir" compacto variante="secundario" onPress={() => accion(async () => { if (!(await gps.habilitarSegundoPlano())) avisar('Segundo plano', 'Permiso no concedido. La captura seguirá solo en primer plano.'); })} />}
        />
      ) : null}

      <View style={{ flexDirection: tablet ? 'row' : 'column', gap: espacio.md }}>
        <View style={{ flex: tablet ? 3 : undefined }}>
          <MapaRecorrido
            segmentos={segmentos}
            paradas={permanencias.map((p) => ({ id: String(p.inicioMs), lat: p.lat, lon: p.lon, etiqueta: p.tipo, tipo: p.tipo, atenciones: p.atenciones }))}
            actual={enCurso && ult ? { lat: ult.lat, lon: ult.lon, precision: ult.precision } : null}
            seguir={enCurso}
            alto={tablet ? 420 : 300}
            teselas={teselas}
          />
        </View>
        <View style={{ flex: tablet ? 2 : undefined }}>
          {capturar ? (
            <View style={{ flexDirection: 'row', gap: espacio.sm, marginBottom: espacio.md }}>
              {enCurso ? (
                <Boton titulo="Pausar" icono={Pause} variante="secundario" grande onPress={() => accion(() => gps.pausarRecorrido(actor))} cargando={ocupado} estilo={{ flex: 1 }} />
              ) : (
                <Boton titulo="Reanudar" icono={Play} variante="acento" grande onPress={() => accion(() => gps.reanudarRecorrido(actor))} cargando={ocupado} estilo={{ flex: 1 }} />
              )}
              <Boton titulo="Finalizar" icono={Square} variante="peligro" grande onPress={finalizar} deshabilitado={ocupado} estilo={{ flex: 1 }} />
            </View>
          ) : null}
          <Tarjeta>
            <Text style={[tipo.subtitulo, { marginBottom: 4 }]}>Actividad detectada automáticamente</Text>
            <Fila style={{ marginBottom: espacio.sm }}>
              <Insignia texto={`En brigada ${formatearDuracion(resumen.brigadaMs)}`} icono={Stethoscope} tono="exito" />
              <Insignia texto={`En movimiento ${formatearDuracion(resumen.movimientoMs)}`} icono={Footprints} tono="acento" />
              <Insignia texto={`Detenido ${formatearDuracion(resumen.paradaMs)}`} />
            </Fila>
            <DatoFila etiqueta="Puntos de brigada (toma de signos)" valor={String(resumen.puntosBrigada)} />
            <DatoFila etiqueta="Atenciones guardadas durante el recorrido" valor={String(resumen.atenciones)} />
            <DatoFila etiqueta="Otras detenciones (≥ 3 min)" valor={String(resumen.paradas)} />
            <DatoFila etiqueta="Segmentos · modo" valor={`${segmentos.length} · ${ruta.modo_traslado === 'A_PIE' ? 'a pie' : 'vehículo'}`} />
            <Text style={[tipo.nota, { marginTop: 6 }]}>
              No necesita marcar paradas: una detención con atenciones guardadas se registra como punto de brigada. Lecturas descartadas: {Object.values(st.rechazados).reduce((x, y) => x + (y ?? 0), 0)}.
            </Text>
            <Boton titulo="Ver detalle" icono={Flag} variante="fantasma" compacto onPress={() => router.push({ pathname: '/rutas/[id]', params: { id: ruta.id } })} estilo={{ alignSelf: 'flex-start', marginTop: 4 }} />
          </Tarjeta>
        </View>
      </View>
    </Pantalla>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={estilos.metricaValor}>{valor}</Text>
      <Text style={estilos.metricaEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  iconoGrande: { width: 72, height: 72, borderRadius: 36, backgroundColor: colores.acentoSuave, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.md },
  cabecera: { borderRadius: 18, padding: espacio.lg, marginBottom: espacio.md },
  estado: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1.5, fontSize: 12, textAlign: 'center', opacity: 0.9 },
  crono: { color: '#FFFFFF', fontSize: 52, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  metricaValor: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricaEtiqueta: { color: '#FFFFFF', fontSize: 11, opacity: 0.85 },
});
