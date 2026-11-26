import { Stack } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import {
  BookOpen, ChartColumn, ChevronDown, ChevronRight, ClipboardList, Database, Download, Flag, History, House, KeyRound, Lightbulb,
  LifeBuoy, Navigation, Search, ShieldCheck, Stethoscope, Users,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Insignia, Pantalla, Vacio } from '../components/ui';
import { MANUAL, type IconoManual, type SeccionManual } from '../content/manual';
import { normalizar } from '../domain/text';
import { colores, espacio, radio, tipo } from '../theme';

const ICONOS: Record<IconoManual, { icono: LucideIcon; color: string; fondo: string }> = {
  ingreso: { icono: KeyRound, color: colores.primario, fondo: colores.primarioSuave },
  inicio: { icono: House, color: colores.primario, fondo: colores.primarioSuave },
  atencion: { icono: Stethoscope, color: colores.exito, fondo: colores.exitoSuave },
  paciente: { icono: Users, color: colores.info, fondo: colores.infoSuave },
  gps: { icono: Navigation, color: colores.acento, fondo: colores.acentoSuave },
  historial: { icono: History, color: '#6941C6', fondo: '#F4EBFF' },
  campana: { icono: Flag, color: colores.primario, fondo: colores.primarioSuave },
  evaluacion: { icono: ClipboardList, color: '#026AA2', fondo: '#E0F2FE' },
  estadisticas: { icono: ChartColumn, color: '#3538CD', fondo: '#E0EAFF' },
  respaldo: { icono: Database, color: colores.aviso, fondo: colores.avisoSuave },
  seguridad: { icono: ShieldCheck, color: colores.peligro, fondo: colores.peligroSuave },
  actualizar: { icono: Download, color: colores.info, fondo: colores.infoSuave },
  ayuda: { icono: LifeBuoy, color: colores.textoSec, fondo: '#EEF1F4' },
};

function textoDe(s: SeccionManual): string {
  return normalizar(
    [s.titulo, s.resumen, ...s.bloques.flatMap((b) => [b.titulo ?? '', ...(b.pasos ?? []), ...(b.puntos ?? []), b.consejo ?? ''])].join(' '),
  );
}

/** Manual de usuario dentro de la app (accesible sin iniciar sesión). */
export default function Manual() {
  const [q, setQ] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(['atencion']));
  const indice = useMemo(() => MANUAL.map((s) => ({ s, texto: textoDe(s) })), []);
  const termino = normalizar(q);
  const visibles = termino ? indice.filter((x) => termino.split(' ').every((t) => x.texto.includes(t))).map((x) => x.s) : MANUAL;

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Manual de usuario' }} />
      <View style={estilos.portada}>
        <BookOpen size={30} color="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text style={estilos.portadaTitulo}>¿Cómo se usa Vitalis Pifo?</Text>
          <Text style={estilos.portadaTexto}>Guía rápida para el equipo de la brigada. Toque un tema para abrirlo.</Text>
        </View>
      </View>

      <View style={estilos.buscador}>
        <Search size={20} color={colores.textoTenue} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar: huella, GPS, duplicado, respaldo…"
          placeholderTextColor={colores.textoTenue}
          style={estilos.buscadorInput}
          autoCorrect={false}
          accessibilityLabel="Buscar en el manual"
        />
      </View>

      {visibles.length === 0 ? <Vacio titulo="Sin resultados" mensaje="Pruebe con otra palabra." /> : null}

      {visibles.map((s) => {
        const ic = ICONOS[s.icono];
        const abierta = !!termino || abiertas.has(s.id);
        return (
          <View key={s.id} style={estilos.tarjeta}>
            <Pressable onPress={() => alternar(s.id)} style={estilos.cabecera} accessibilityRole="button" accessibilityState={{ expanded: abierta }} accessibilityLabel={s.titulo}>
              <View style={[estilos.icono, { backgroundColor: ic.fondo }]}>
                <ic.icono size={22} color={ic.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={tipo.subtitulo}>{s.titulo}</Text>
                <Text style={tipo.nota}>{s.resumen}</Text>
              </View>
              {abierta ? <ChevronDown size={20} color={colores.textoTenue} /> : <ChevronRight size={20} color={colores.textoTenue} />}
            </Pressable>
            {abierta ? (
              <View style={estilos.cuerpo}>
                {s.para ? <View style={{ marginBottom: espacio.sm }}><Insignia texto={`Para: ${s.para}`} /></View> : null}
                {s.bloques.map((b, i) => (
                  <View key={i} style={{ marginBottom: espacio.md }}>
                    {b.titulo ? <Text style={[tipo.cuerpo, { fontWeight: '700', marginBottom: 6 }]}>{b.titulo}</Text> : null}
                    {b.pasos?.map((p, k) => (
                      <View key={`p${k}`} style={estilos.paso}>
                        <View style={[estilos.numero, { backgroundColor: ic.color }]}>
                          <Text style={estilos.numeroTexto}>{k + 1}</Text>
                        </View>
                        <Text style={[tipo.cuerpo, estilos.textoLinea]}>{p}</Text>
                      </View>
                    ))}
                    {b.puntos?.map((p, k) => (
                      <View key={`b${k}`} style={estilos.paso}>
                        <View style={[estilos.vineta, { backgroundColor: ic.color }]} />
                        <Text style={[tipo.cuerpo, estilos.textoLinea]}>{p}</Text>
                      </View>
                    ))}
                    {b.consejo ? (
                      <View style={estilos.consejo}>
                        <Lightbulb size={18} color={colores.aviso} />
                        <Text style={[tipo.secundario, { flex: 1, color: '#7A3E00' }]}>{b.consejo}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={[tipo.nota, { textAlign: 'center', marginTop: espacio.md }]}>¿Dudas? Consulte con el administrador de la brigada.</Text>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  portada: { flexDirection: 'row', alignItems: 'center', gap: espacio.md, backgroundColor: colores.primario, borderRadius: 20, padding: espacio.lg, marginBottom: espacio.md },
  portadaTitulo: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  portadaTexto: { color: '#CFE6E2', fontSize: 13, marginTop: 2 },
  buscador: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.sm, backgroundColor: colores.superficie, borderRadius: radio.md,
    borderWidth: 1, borderColor: colores.bordeFuerte, paddingHorizontal: espacio.md, minHeight: 50, marginBottom: espacio.md,
  },
  buscadorInput: { flex: 1, fontSize: 16, color: colores.texto, paddingVertical: 10 },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radio.lg, borderWidth: 1, borderColor: colores.borde, marginBottom: espacio.sm, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.md, padding: espacio.md, minHeight: 64 },
  icono: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cuerpo: { paddingHorizontal: espacio.lg, paddingBottom: espacio.sm, borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: espacio.md },
  paso: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  numero: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numeroTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  vineta: { width: 7, height: 7, borderRadius: 4, marginTop: 8, marginLeft: 8, marginRight: 8 },
  textoLinea: { flex: 1, lineHeight: 22 },
  consejo: { flexDirection: 'row', gap: 8, backgroundColor: colores.avisoSuave, borderRadius: radio.md, padding: espacio.md, alignItems: 'flex-start', marginTop: 4 },
});
