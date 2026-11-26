import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { fechaHora } from '../domain/time';
import type { AtencionConPaciente } from '../domain/types';
import { colores, espacio, tipo, useResponsive } from '../theme';
import { Seccion, Tarjeta } from './ui';

interface Medida {
  etiqueta: string;
  unidad: string;
  valor: (a: AtencionConPaciente) => number | null;
  texto?: (a: AtencionConPaciente) => string;
  decimales?: number;
}

const MEDIDAS: Medida[] = [
  { etiqueta: 'Presión', unidad: 'mmHg', valor: (a) => a.sistolica, texto: (a) => `${a.sistolica}/${a.diastolica}` },
  { etiqueta: 'Frecuencia', unidad: 'lpm', valor: (a) => a.frecuencia },
  { etiqueta: 'Temperatura', unidad: '°C', valor: (a) => a.temperatura, decimales: 1 },
  { etiqueta: 'SpO₂', unidad: '%', valor: (a) => a.spo2 },
  { etiqueta: 'Peso', unidad: 'kg', valor: (a) => a.peso, decimales: 1 },
  { etiqueta: 'IMC', unidad: 'kg/m²', valor: (a) => a.imc, decimales: 2 },
];

const num = (v: number, d = 0) => v.toFixed(d).replace('.', ',');

/**
 * Última medición de cada signo frente a la anterior registrada (descriptivo, sin interpretación clínica).
 * `hist` viene ordenado de la más reciente a la más antigua.
 */
export function EvolucionVitales({ hist }: { hist: AtencionConPaciente[] }) {
  const { tablet } = useResponsive();
  const validas = hist.filter((a) => !a.anulado_at);
  if (validas.length === 0) return null;
  return (
    <Seccion titulo="Evolución">
      <Tarjeta>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
          {MEDIDAS.map((m) => {
            const conValor = validas.filter((a) => m.valor(a) != null);
            const ultima = conValor[0];
            const previa = conValor[1];
            const v = ultima ? (m.valor(ultima) as number) : null;
            const p = previa ? (m.valor(previa) as number) : null;
            const delta = v != null && p != null ? v - p : null;
            const Flecha = delta == null || Math.abs(delta) < 1e-9 ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
            return (
              <View key={m.etiqueta} style={{ width: tablet ? '33.33%' : '50%', padding: 6 }}>
                <View style={{ backgroundColor: colores.superficieAlt, borderRadius: 12, padding: espacio.md, minHeight: 86 }}>
                  <Text style={tipo.nota}>{m.etiqueta}</Text>
                  <Text style={[tipo.subtitulo, { fontVariant: ['tabular-nums'] }]}>
                    {ultima ? (m.texto ? m.texto(ultima) : num(v as number, m.decimales)) : '—'}
                    <Text style={tipo.nota}> {ultima ? m.unidad : ''}</Text>
                  </Text>
                  {delta != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Flecha size={13} color={colores.textoSec} />
                      <Text style={tipo.nota}>
                        {delta > 0 ? '+' : ''}{num(delta, m.decimales)} vs. {fechaHora(previa!.fecha).slice(0, 5)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={tipo.nota}>{ultima ? 'Primera medición' : 'Sin registro'}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[tipo.nota, { marginTop: 4 }]}>Comparación descriptiva con la medición anterior; no es una interpretación clínica.</Text>
      </Tarjeta>
    </Seccion>
  );
}
