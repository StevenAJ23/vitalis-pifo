import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { formatearImc } from '../domain/imc';
import { fechaHora } from '../domain/time';
import type { AtencionConPaciente } from '../domain/types';
import { espacio, tipo } from '../theme';
import { Insignia, Tarjeta } from './ui';

const n = (v: number | null, u: string) => (v == null ? '—' : `${String(v).replace('.', ',')} ${u}`);

export function TarjetaAtencion({ a, mostrarPaciente }: { a: AtencionConPaciente; mostrarPaciente?: boolean }) {
  return (
    <Tarjeta onPress={() => router.push({ pathname: '/atencion/[id]', params: { id: a.id } })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espacio.sm }}>
        <View style={{ flex: 1 }}>
          {mostrarPaciente ? <Text style={tipo.subtitulo}>{a.paciente_nombre}</Text> : null}
          <Text style={tipo.secundario}>{fechaHora(a.fecha)} · {a.campana_nombre}</Text>
          {mostrarPaciente ? <Text style={tipo.nota}>{a.paciente_codigo} · {a.paciente_sector}</Text> : null}
        </View>
        <View style={{ gap: 4, alignItems: 'flex-end' }}>
          {a.anulado_at ? <Insignia texto="ANULADA" tono="peligro" /> : null}
          {a.requiere_revision && !a.revisado_at ? <Insignia texto="Revisión" tono="aviso" /> : null}
          {a.seguimiento ? <Insignia texto="Seguimiento" tono="info" /> : null}
          {a.version > 1 ? <Insignia texto={`v${a.version}`} /> : null}
        </View>
      </View>
      <Text style={[tipo.cuerpo, { marginTop: espacio.sm }]}>
        PA {a.sistolica != null ? `${a.sistolica}/${a.diastolica}` : '—'} · FC {n(a.frecuencia, 'lpm')} · T {n(a.temperatura, '°C')} · SpO₂ {n(a.spo2, '%')}
      </Text>
      <Text style={tipo.secundario}>Peso {n(a.peso, 'kg')} · Talla {n(a.talla_cm, 'cm')} · IMC {formatearImc(a.imc)}</Text>
    </Tarjeta>
  );
}
