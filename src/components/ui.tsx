import type { LucideIcon } from 'lucide-react-native';
import { CircleAlert, Inbox } from 'lucide-react-native';
import React, { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colores, espacio, radio, tipo, useResponsive } from '../theme';
import { BarraEstado } from './BarraEstado';

/* ------------------------------ Contenedores ------------------------------ */

/** Altura actual del teclado en pantalla (0 si está oculto). */
function useAlturaTeclado(): number {
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setAlto(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setAlto(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return alto;
}

export function Pantalla({
  children,
  scroll = true,
  refrescar,
  pie,
}: {
  children: ReactNode;
  scroll?: boolean;
  refrescar?: ReactNode;
  pie?: ReactNode;
}) {
  const { anchoMax } = useResponsive();
  const teclado = useAlturaTeclado();
  const contenido = <View style={[estilos.contenido, { maxWidth: anchoMax }]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={estilos.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BarraEstado />
      {scroll ? (
        <ScrollView
          // Con el teclado abierto se agrega su altura al final: permite desplazarse hasta el último campo
          // (en Android edge-to-edge la ventana no se redimensiona sola).
          contentContainerStyle={[estilos.scroll, Platform.OS === 'android' && teclado > 0 ? { paddingBottom: teclado + espacio.xxl } : null]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          refreshControl={refrescar as React.ReactElement<never> | undefined}
        >
          {contenido}
        </ScrollView>
      ) : (
        <View style={[estilos.scroll, { flex: 1 }]}>{contenido}</View>
      )}
      {pie ? <View style={estilos.pie}><View style={{ width: '100%', maxWidth: anchoMax, alignSelf: 'center' }}>{pie}</View></View> : null}
    </KeyboardAvoidingView>
  );
}

export function Tarjeta({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [estilos.tarjeta, pressed && { opacity: 0.85 }, style]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

export function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.lg }}>
      <View style={estilos.seccionCab}>
        <Text style={tipo.subtitulo} accessibilityRole="header">{titulo}</Text>
        {accion}
      </View>
      {children}
    </View>
  );
}

export function Fila({ children, gap = espacio.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

/** Rejilla adaptable (1–4 columnas según el ancho). */
export function Rejilla({ children, columnas }: { children: ReactNode; columnas?: number }) {
  const r = useResponsive();
  const n = columnas ?? r.columnasKpi;
  const items = React.Children.toArray(children);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -espacio.xs }}>
      {items.map((c, i) => (
        <View key={i} style={{ width: `${100 / n}%`, padding: espacio.xs }}>
          {c}
        </View>
      ))}
    </View>
  );
}

/* --------------------------------- Botones -------------------------------- */

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'acento';

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  icono: Icono,
  cargando,
  deshabilitado,
  grande,
  compacto,
  estilo,
  etiquetaAccesible,
}: {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  icono?: LucideIcon;
  cargando?: boolean;
  deshabilitado?: boolean;
  grande?: boolean;
  compacto?: boolean;
  estilo?: StyleProp<ViewStyle>;
  etiquetaAccesible?: string;
}) {
  const v = VARIANTES[variante];
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible ?? titulo}
      accessibilityState={{ disabled: !!inactivo, busy: !!cargando }}
      style={({ pressed }) => [
        estilos.boton,
        { backgroundColor: v.fondo, borderColor: v.borde },
        grande && { minHeight: 56, paddingHorizontal: espacio.xl },
        compacto && { minHeight: 38, paddingHorizontal: espacio.md },
        pressed && !inactivo && { opacity: 0.85 },
        inactivo && { opacity: 0.5 },
        estilo,
      ]}
    >
      {cargando ? <ActivityIndicator color={v.texto} /> : Icono ? <Icono color={v.texto} size={grande ? 22 : 18} /> : null}
      <Text style={[estilos.botonTexto, { color: v.texto }, grande && { fontSize: 17 }, compacto && { fontSize: 14 }]}>{titulo}</Text>
    </Pressable>
  );
}

const VARIANTES: Record<Variante, { fondo: string; texto: string; borde: string }> = {
  primario: { fondo: colores.primario, texto: '#FFFFFF', borde: colores.primario },
  secundario: { fondo: colores.superficie, texto: colores.primario, borde: colores.bordeFuerte },
  peligro: { fondo: colores.peligro, texto: '#FFFFFF', borde: colores.peligro },
  fantasma: { fondo: 'transparent', texto: colores.primario, borde: 'transparent' },
  acento: { fondo: colores.acento, texto: '#FFFFFF', borde: colores.acento },
};

/* --------------------------------- Campos --------------------------------- */

export interface CampoProps extends TextInputProps {
  etiqueta: string;
  error?: string;
  /** Advertencia no bloqueante (ámbar), p. ej. valor fuera de lo habitual. */
  advertencia?: string;
  ayuda?: string;
  unidad?: string;
  requerido?: boolean;
  /** Referencia al TextInput (para saltar al siguiente campo). */
  refEntrada?: React.Ref<React.ComponentRef<typeof TextInput>>;
}

export function Campo({ etiqueta, error, advertencia, ayuda, unidad, requerido, style, refEntrada, ...props }: CampoProps) {
  return (
    <View style={{ marginBottom: espacio.md }}>
      <Text style={estilos.etiqueta}>
        {etiqueta}
        {requerido ? <Text style={{ color: colores.peligro }}> *</Text> : null}
      </Text>
      <View style={[estilos.campoCaja, error ? { borderColor: colores.peligro, borderWidth: 1.5 } : advertencia ? { borderColor: colores.aviso, borderWidth: 1.5, backgroundColor: '#FFFBF0' } : null]}>
        <TextInput
          ref={refEntrada}
          placeholderTextColor={colores.textoTenue}
          style={[estilos.campo, style]}
          accessibilityLabel={etiqueta}
          accessibilityHint={error ?? ayuda}
          {...props}
        />
        {unidad ? <Text style={estilos.unidad}>{unidad}</Text> : null}
      </View>
      {error ? (
        <Text style={estilos.error} accessibilityLiveRegion="polite">{error}</Text>
      ) : advertencia ? (
        <Text style={[estilos.error, { color: colores.aviso }]} accessibilityLiveRegion="polite">{advertencia}</Text>
      ) : ayuda ? (
        <Text style={tipo.nota}>{ayuda}</Text>
      ) : null}
    </View>
  );
}

export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
  error,
}: {
  etiqueta?: string;
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
  error?: string;
}) {
  return (
    <View style={{ marginBottom: espacio.md }}>
      {etiqueta ? <Text style={estilos.etiqueta}>{etiqueta}</Text> : null}
      <View style={estilos.segmentado} accessibilityRole="radiogroup">
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <Pressable
              key={o.valor}
              onPress={() => onCambio(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo }}
              style={[estilos.segmento, activo && estilos.segmentoActivo]}
            >
              <Text style={[estilos.segmentoTexto, activo && { color: '#FFFFFF' }]}>{o.texto}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

export function Interruptor({ etiqueta, descripcion, valor, onCambio, deshabilitado }: { etiqueta: string; descripcion?: string; valor: boolean; onCambio: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <View style={estilos.interruptor}>
      <View style={{ flex: 1, paddingRight: espacio.md }}>
        <Text style={tipo.cuerpo}>{etiqueta}</Text>
        {descripcion ? <Text style={tipo.nota}>{descripcion}</Text> : null}
      </View>
      <Switch
        value={valor}
        onValueChange={onCambio}
        disabled={deshabilitado}
        trackColor={{ true: colores.primario, false: colores.bordeFuerte }}
        thumbColor="#FFFFFF"
        accessibilityLabel={etiqueta}
      />
    </View>
  );
}

/* --------------------------------- Avatar --------------------------------- */

const AVATAR_COLORES = [
  ['#E2F0EE', '#0F5F59'], ['#E0EAFF', '#3538CD'], ['#FDEDE2', '#B93815'], ['#F4EBFF', '#6941C6'],
  ['#DCFAE6', '#067647'], ['#FEF0C7', '#B54708'], ['#FCE7F6', '#C11574'], ['#E0F2FE', '#026AA2'],
];

/** Iniciales con un color estable derivado del nombre (ayuda a reconocer rápidamente a la persona). */
export function Avatar({ nombres, apellidos, tamano = 40 }: { nombres: string; apellidos: string; tamano?: number }) {
  const clave = `${nombres}${apellidos}`;
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  const [fondo, texto] = AVATAR_COLORES[h % AVATAR_COLORES.length];
  return (
    <View style={{ width: tamano, height: tamano, borderRadius: tamano / 2, backgroundColor: fondo, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: texto, fontWeight: '700', fontSize: tamano * 0.38 }}>{(nombres[0] ?? '') + (apellidos[0] ?? '')}</Text>
    </View>
  );
}

/* ------------------------------- Indicadores ------------------------------ */

type Tono = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'info' | 'primario' | 'acento';
const TONOS: Record<Tono, { fondo: string; texto: string }> = {
  neutro: { fondo: '#EEF1F4', texto: colores.textoSec },
  exito: { fondo: colores.exitoSuave, texto: colores.exito },
  aviso: { fondo: colores.avisoSuave, texto: colores.aviso },
  peligro: { fondo: colores.peligroSuave, texto: colores.peligro },
  info: { fondo: colores.infoSuave, texto: colores.info },
  primario: { fondo: colores.primarioSuave, texto: colores.primario },
  acento: { fondo: colores.acentoSuave, texto: colores.acento },
};

export function Insignia({ texto, tono = 'neutro', icono: Icono }: { texto: string; tono?: Tono; icono?: LucideIcon }) {
  const t = TONOS[tono];
  return (
    <View style={[estilos.insignia, { backgroundColor: t.fondo }]}>
      {Icono ? <Icono size={13} color={t.texto} /> : null}
      <Text style={[estilos.insigniaTexto, { color: t.texto }]}>{texto}</Text>
    </View>
  );
}

export function Kpi({ etiqueta, valor, detalle, icono: Icono, tono = 'primario' }: { etiqueta: string; valor: string; detalle?: string; icono?: LucideIcon; tono?: Tono }) {
  const t = TONOS[tono];
  return (
    <View style={estilos.kpi} accessible accessibilityLabel={`${etiqueta}: ${valor}${detalle ? `, ${detalle}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {Icono ? (
          <View style={[estilos.kpiIcono, { backgroundColor: t.fondo }]}>
            <Icono size={15} color={t.texto} />
          </View>
        ) : null}
        <Text style={[tipo.nota, { flex: 1 }]} numberOfLines={2}>{etiqueta}</Text>
      </View>
      <Text style={tipo.cifra} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {detalle ? <Text style={tipo.nota} numberOfLines={2}>{detalle}</Text> : null}
    </View>
  );
}

export function Aviso({ texto, tono = 'aviso', icono: Icono = CircleAlert, accion }: { texto: string; tono?: Tono; icono?: LucideIcon; accion?: ReactNode }) {
  const t = TONOS[tono];
  return (
    <View style={[estilos.aviso, { backgroundColor: t.fondo }]} accessibilityRole="alert">
      <Icono size={18} color={t.texto} />
      <Text style={[tipo.secundario, { color: t.texto, flex: 1 }]}>{texto}</Text>
      {accion}
    </View>
  );
}

export function Vacio({ titulo, mensaje, icono: Icono = Inbox, accion }: { titulo: string; mensaje?: string; icono?: LucideIcon; accion?: ReactNode }) {
  return (
    <View style={estilos.vacio}>
      <View style={estilos.vacioIcono}>
        <Icono size={28} color={colores.primario} />
      </View>
      <Text style={[tipo.subtitulo, { textAlign: 'center' }]}>{titulo}</Text>
      {mensaje ? <Text style={[tipo.secundario, { textAlign: 'center', marginTop: 4 }]}>{mensaje}</Text> : null}
      {accion ? <View style={{ marginTop: espacio.md }}>{accion}</View> : null}
    </View>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={estilos.vacio}>
      <ActivityIndicator color={colores.primario} size="large" />
      <Text style={[tipo.secundario, { marginTop: espacio.sm }]}>{texto}</Text>
    </View>
  );
}

export function ErrorVista({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <Vacio
      titulo="No se pudo cargar"
      mensaje={mensaje}
      icono={CircleAlert}
      accion={reintentar ? <Boton titulo="Reintentar" variante="secundario" onPress={reintentar} /> : undefined}
    />
  );
}

export function DatoFila({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: 'aviso' | 'peligro' }) {
  return (
    <View style={estilos.datoFila}>
      <Text style={[tipo.secundario, { flex: 1 }]}>{etiqueta}</Text>
      <Text style={[tipo.cuerpo, { fontWeight: '600', flexShrink: 1, textAlign: 'right' }, tono ? { color: TONOS[tono].texto } : null]}>{valor}</Text>
    </View>
  );
}

/** Barras horizontales de una serie: un tono, extremos redondeados, valor en tinta de texto. */
export function Barras({ datos, sufijo = '', vacio = 'Sin datos' }: { datos: { etiqueta: string; valor: number }[]; sufijo?: string; vacio?: string }) {
  const max = Math.max(0, ...datos.map((d) => d.valor));
  if (datos.length === 0 || max === 0) return <Text style={tipo.nota}>{vacio}</Text>;
  return (
    <View accessibilityRole="summary">
      {datos.map((d) => (
        <View key={d.etiqueta} style={{ marginBottom: 8 }} accessible accessibilityLabel={`${d.etiqueta}: ${d.valor}${sufijo}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={tipo.secundario} numberOfLines={1}>{d.etiqueta}</Text>
            <Text style={[tipo.secundario, { fontWeight: '600', color: colores.texto }]}>{d.valor}{sufijo}</Text>
          </View>
          <View style={estilos.barraFondo}>
            <View style={[estilos.barra, { width: `${Math.max(2, (d.valor / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------- Utils --------------------------------- */

/** Diálogos propios de la app (no los genéricos del sistema). */
export { avisar, confirmar, notificar } from '../state/dialogo';

export const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espacio.lg, paddingBottom: espacio.xxl * 2 },
  contenido: { width: '100%', alignSelf: 'center' },
  pie: { padding: espacio.md, backgroundColor: colores.superficie, borderTopWidth: 1, borderTopColor: colores.borde },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    marginBottom: espacio.md,
  },
  seccionCab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.sm },
  boton: {
    minHeight: 48,
    borderRadius: radio.md,
    paddingHorizontal: espacio.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    borderWidth: 1,
  },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  etiqueta: { ...tipo.etiqueta, marginBottom: 6 },
  campoCaja: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeFuerte,
    borderRadius: radio.md,
    minHeight: 50,
  },
  campo: { flex: 1, fontSize: 17, paddingHorizontal: espacio.md, paddingVertical: 10, color: colores.texto },
  unidad: { paddingHorizontal: espacio.md, color: colores.textoTenue, fontSize: 14, fontWeight: '600' },
  error: { color: colores.peligro, fontSize: 13, marginTop: 4 },
  segmentado: { flexDirection: 'row', backgroundColor: '#EAEFED', borderRadius: radio.md, padding: 3, gap: 3 },
  segmento: { flex: 1, minHeight: 42, borderRadius: radio.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentoActivo: { backgroundColor: colores.primario },
  segmentoTexto: { fontSize: 14, fontWeight: '600', color: colores.textoSec, textAlign: 'center' },
  interruptor: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.sm, minHeight: 52 },
  insignia: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radio.pill, alignSelf: 'flex-start' },
  insigniaTexto: { fontSize: 12, fontWeight: '700' },
  kpi: { backgroundColor: colores.superficie, borderRadius: radio.lg, padding: espacio.md, borderWidth: 1, borderColor: colores.borde, minHeight: 112 },
  kpiIcono: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.md, borderRadius: radio.md, marginBottom: espacio.md },
  vacio: { alignItems: 'center', justifyContent: 'center', paddingVertical: espacio.xxl, paddingHorizontal: espacio.lg },
  vacioIcono: { width: 56, height: 56, borderRadius: 28, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.md },
  datoFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde, gap: espacio.md },
  barraFondo: { height: 10, borderRadius: 5, backgroundColor: '#EDF1EF', overflow: 'hidden' },
  barra: { height: 10, borderRadius: 5, backgroundColor: colores.barra },
});
