import { Crosshair, Layers, Lock, LockOpen, Minus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { aMundo, cajaDe, escalaRedonda, metrosPorPixel, TAM_TESELA, zoomParaCaja, type Punto } from '../domain/geo';
import { colores, radio } from '../theme';

export interface ParadaMapa extends Punto {
  id: string;
  etiqueta: string;
  /** BRIGADA (toma de signos detectada), PARADA (detención detectada) o MANUAL (registros antiguos). */
  tipo?: 'BRIGADA' | 'PARADA' | 'MANUAL';
  atenciones?: number;
}

interface Props {
  segmentos: Punto[][];
  paradas?: ParadaMapa[];
  actual?: (Punto & { precision: number | null }) | null;
  alto?: number;
  /** Centrar en la posición actual (vista en vivo). */
  seguir?: boolean;
  /** Mapa base en línea autorizado y con conexión disponible. */
  teselas: { habilitadas: boolean; url: string; enLinea: boolean };
  finalizado?: boolean;
}

const UA = 'VitalisPifoMobile/0.2 (+offline-first field app)';

/**
 * Mapa del recorrido sin SDKs propietarios ni claves de API:
 * - Proyección Web Mercator propia + polilíneas SVG independientes por segmento (no se unen pausas ni pérdidas).
 * - Mapa base opcional con teselas XYZ (p. ej. OpenStreetMap) solo si el administrador lo autoriza y hay conexión.
 * - Sin mapa base: trazado esquemático local con cuadrícula, norte y escala aproximada (funciona sin internet).
 */
export function MapaRecorrido({ segmentos, paradas = [], actual, alto = 320, seguir, teselas, finalizado }: Props) {
  const [ancho, setAncho] = useState(0);
  const [zoomExtra, setZoomExtra] = useState(0);
  const [fijo, setFijo] = useState({ x: 0, y: 0 }); // desplazamiento confirmado
  const [arrastre, setArrastre] = useState({ x: 0, y: 0 }); // gesto en curso
  const [libre, setLibre] = useState(false);
  const [esquema, setEsquema] = useState(false);
  const [fallos, setFallos] = useState(0);
  // Bloqueado por defecto: el arrastre desplaza la página; desbloqueado, mueve el mapa.
  const [desbloqueado, setDesbloqueado] = useState(false);
  const desp = { x: fijo.x + arrastre.x, y: fijo.y + arrastre.y };

  const pan = useMemo(() => {
    const soltar = (dx: number, dy: number) => {
      setFijo((f) => ({ x: f.x + dx, y: f.y + dy }));
      setArrastre({ x: 0, y: 0 });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        setLibre(true);
        setArrastre({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => soltar(g.dx, g.dy),
      onPanResponderTerminate: (_, g) => soltar(g.dx, g.dy),
    });
  }, []);

  const todos = useMemo(() => {
    const t: Punto[] = segmentos.flat();
    for (const p of paradas) t.push(p);
    if (actual) t.push(actual);
    return t;
  }, [segmentos, paradas, actual]);

  const caja = cajaDe(todos);
  const onLayout = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  if (!caja || ancho === 0) {
    return (
      <View style={[estilos.marco, { height: alto }]} onLayout={onLayout}>
        <View style={estilos.centro}>
          <Text style={estilos.vacioTexto}>{ancho === 0 ? '' : 'Esperando la primera posición válida…'}</Text>
        </View>
      </View>
    );
  }

  const puntoUnico = caja.minLat === caja.maxLat && caja.minLon === caja.maxLon;
  const zBase = puntoUnico ? 17 : zoomParaCaja(caja, ancho, alto, 40, 18);
  const z = Math.max(3, Math.min(19, zBase + zoomExtra));
  const centro: Punto = seguir && actual && !libre ? actual : { lat: (caja.minLat + caja.maxLat) / 2, lon: (caja.minLon + caja.maxLon) / 2 };
  const cm = aMundo(centro, z);
  const origen = { x: cm.x - ancho / 2 - desp.x, y: cm.y - alto / 2 - desp.y };
  const proy = (p: Punto) => {
    const w = aMundo(p, z);
    return { x: w.x - origen.x, y: w.y - origen.y };
  };

  const mostrarTeselas = teselas.habilitadas && teselas.enLinea && !esquema && fallos < 4;
  const imgs: { clave: string; uri: string; left: number; top: number }[] = [];
  if (mostrarTeselas) {
    const n = 2 ** z;
    const x0 = Math.floor(origen.x / TAM_TESELA), x1 = Math.floor((origen.x + ancho) / TAM_TESELA);
    const y0 = Math.floor(origen.y / TAM_TESELA), y1 = Math.floor((origen.y + alto) / TAM_TESELA);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        imgs.push({
          clave: `${z}/${wx}/${ty}`,
          uri: teselas.url.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(ty)),
          left: tx * TAM_TESELA - origen.x,
          top: ty * TAM_TESELA - origen.y,
        });
      }
    }
  }

  const mpp = metrosPorPixel(centro.lat, z);
  const escalaM = escalaRedonda(mpp * 110);
  const escalaPx = escalaM / mpp;
  const segsPx = segmentos.filter((s) => s.length > 0).map((s) => s.map(proy));
  const inicio = segmentos.find((s) => s.length > 0)?.[0];
  const ultimoSeg = [...segmentos].reverse().find((s) => s.length > 0);
  const fin = finalizado && ultimoSeg ? ultimoSeg[ultimoSeg.length - 1] : null;

  const ajustar = () => {
    setZoomExtra(0);
    setFijo({ x: 0, y: 0 });
    setArrastre({ x: 0, y: 0 });
    setLibre(false);
  };

  return (
    <View style={[estilos.marco, { height: alto }]} onLayout={onLayout} {...(desbloqueado ? pan.panHandlers : {})} accessibilityLabel="Mapa del recorrido">
      {mostrarTeselas
        ? imgs.map((t) => (
            <Image
              key={t.clave}
              source={{ uri: t.uri, headers: { 'User-Agent': UA } }}
              style={{ position: 'absolute', left: t.left, top: t.top, width: TAM_TESELA, height: TAM_TESELA }}
              onError={() => setFallos((f) => f + 1)}
            />
          ))
        : null}
      <Svg width={ancho} height={alto} style={StyleSheet.absoluteFill}>
        {!mostrarTeselas ? (
          <G>
            <Rect x={0} y={0} width={ancho} height={alto} fill={colores.mapaFondo} />
            {Array.from({ length: Math.ceil(ancho / 48) + 1 }, (_, i) => (
              <Line key={`v${i}`} x1={i * 48 + (((desp.x % 48) + 48) % 48)} y1={0} x2={i * 48 + (((desp.x % 48) + 48) % 48)} y2={alto} stroke={colores.mapaGrilla} strokeWidth={1} />
            ))}
            {Array.from({ length: Math.ceil(alto / 48) + 1 }, (_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * 48 + (((desp.y % 48) + 48) % 48)} x2={ancho} y2={i * 48 + (((desp.y % 48) + 48) % 48)} stroke={colores.mapaGrilla} strokeWidth={1} />
            ))}
          </G>
        ) : null}
        {segsPx.map((s, i) => (
          <G key={i}>
            <Polyline points={s.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points={s.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colores.acento} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
        {paradas.map((p) => {
          const q = proy(p);
          if (p.tipo === 'BRIGADA') {
            return (
              <G key={p.id}>
                <Circle cx={q.x} cy={q.y} r={13} fill={colores.exito} stroke="#FFFFFF" strokeWidth={2.5} />
                <SvgText x={q.x} y={q.y + 4} fontSize={11} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">{String(p.atenciones ?? '')}</SvgText>
              </G>
            );
          }
          return <Circle key={p.id} cx={q.x} cy={q.y} r={7} fill={p.tipo === 'PARADA' ? '#98A2B3' : '#F5B300'} stroke="#FFFFFF" strokeWidth={2} />;
        })}
        {inicio ? (() => { const q = proy(inicio); return <Circle cx={q.x} cy={q.y} r={8} fill={colores.exito} stroke="#FFFFFF" strokeWidth={2.5} />; })() : null}
        {fin ? (() => { const q = proy(fin); return <Rect x={q.x - 7} y={q.y - 7} width={14} height={14} rx={3} fill={colores.peligro} stroke="#FFFFFF" strokeWidth={2.5} />; })() : null}
        {actual && !finalizado ? (() => {
          const q = proy(actual);
          const halo = actual.precision ? Math.min(120, actual.precision / mpp) : 0;
          return (
            <G>
              {halo > 8 ? <Circle cx={q.x} cy={q.y} r={halo} fill={colores.info} fillOpacity={0.12} stroke={colores.info} strokeOpacity={0.35} /> : null}
              <Circle cx={q.x} cy={q.y} r={8} fill={colores.info} stroke="#FFFFFF" strokeWidth={3} />
            </G>
          );
        })() : null}
        {/* Norte y escala aproximada */}
        <G>
          <Circle cx={22} cy={22} r={14} fill="#FFFFFF" fillOpacity={0.9} />
          <SvgText x={22} y={27} fontSize={13} fontWeight="bold" fill={colores.texto} textAnchor="middle">N</SvgText>
          <Rect x={10} y={alto - 26} width={escalaPx + 12} height={20} rx={4} fill="#FFFFFF" fillOpacity={0.85} />
          <Line x1={16} y1={alto - 12} x2={16 + escalaPx} y2={alto - 12} stroke={colores.texto} strokeWidth={2} />
          <Line x1={16} y1={alto - 16} x2={16} y2={alto - 8} stroke={colores.texto} strokeWidth={2} />
          <Line x1={16 + escalaPx} y1={alto - 16} x2={16 + escalaPx} y2={alto - 8} stroke={colores.texto} strokeWidth={2} />
          <SvgText x={16 + escalaPx / 2} y={alto - 15} fontSize={10} fill={colores.texto} textAnchor="middle">
            {escalaM >= 1000 ? `${escalaM / 1000} km` : `${escalaM} m`}
          </SvgText>
        </G>
      </Svg>

      <View style={estilos.controles}>
        <BotonMapa etiqueta={desbloqueado ? 'Bloquear mapa' : 'Desbloquear para mover el mapa'} onPress={() => setDesbloqueado((v) => !v)} activo={desbloqueado}>
          {desbloqueado ? <LockOpen size={18} color="#FFFFFF" /> : <Lock size={18} color={colores.texto} />}
        </BotonMapa>
        <BotonMapa etiqueta="Acercar" onPress={() => setZoomExtra((v) => Math.min(v + 1, 19 - zBase))}><Plus size={18} color={colores.texto} /></BotonMapa>
        <BotonMapa etiqueta="Alejar" onPress={() => setZoomExtra((v) => Math.max(v - 1, 3 - zBase))}><Minus size={18} color={colores.texto} /></BotonMapa>
        <BotonMapa etiqueta="Ajustar al recorrido" onPress={ajustar}><Crosshair size={18} color={colores.texto} /></BotonMapa>
        {teselas.habilitadas ? (
          <BotonMapa etiqueta="Cambiar mapa base / esquema" onPress={() => { setEsquema((v) => !v); setFallos(0); }}>
            <Layers size={18} color={colores.texto} />
          </BotonMapa>
        ) : null}
      </View>

      <View style={estilos.leyenda} pointerEvents="none">
        <Text style={estilos.leyendaTexto}>
          {mostrarTeselas
            ? '© OpenStreetMap contributors'
            : teselas.habilitadas && (fallos >= 4 || !teselas.enLinea)
              ? 'Mapa base no disponible · trazado esquemático'
              : 'Trazado esquemático · escala aproximada'}
        </Text>
      </View>
    </View>
  );
}

function BotonMapa({ children, onPress, etiqueta, activo }: { children: React.ReactNode; onPress: () => void; etiqueta: string; activo?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[estilos.botonMapa, activo && { backgroundColor: colores.primario, borderColor: colores.primario }]} accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={6}>
      {children}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  marco: { borderRadius: radio.lg, overflow: 'hidden', backgroundColor: colores.mapaFondo, borderWidth: 1, borderColor: colores.borde, marginBottom: 12 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vacioTexto: { color: colores.textoTenue, fontSize: 14 },
  controles: { position: 'absolute', right: 8, top: 8, gap: 6 },
  botonMapa: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colores.borde },
  leyenda: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  leyendaTexto: { fontSize: 10, color: colores.textoSec },
});
