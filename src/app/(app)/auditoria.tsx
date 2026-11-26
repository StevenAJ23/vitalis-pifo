import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCarga } from '../../components/hooks';
import { Boton, Cargando, ErrorVista, Pantalla, Tarjeta, Vacio } from '../../components/ui';
import { fechaHora } from '../../domain/time';
import { listarAuditoria } from '../../repositories/auditoria';
import { exigir } from '../../security/permissions';
import { useActor, useDb } from '../../state/app';
import { colores, espacio, tipo } from '../../theme';

const FILTROS = ['', 'LOGIN_FALLIDO', 'VER_FICHA', 'CORREGIR', 'ANULAR', 'EXPORTAR_CSV', 'EXPORTAR_GEOJSON', 'RESPALDO_CREAR', 'RESPALDO_RESTAURAR', 'MODO_DATOS'];

/** Registro de auditoría (solo lectura). No contiene valores clínicos ni datos personales. */
export default function Auditoria() {
  const db = useDb();
  const actor = useActor();
  const [accion, setAccion] = useState('');
  const [limite, setLimite] = useState(100);
  const { datos, error, recargar } = useCarga(async () => {
    exigir(actor.rol, 'auditoria.ver');
    return listarAuditoria(db, { accion: accion || undefined, limite });
  }, [accion, limite]);

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Auditoría' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espacio.md }}>
        {FILTROS.map((f) => (
          <Boton key={f || 'todas'} titulo={f || 'Todas'} compacto variante={accion === f ? 'primario' : 'secundario'} onPress={() => setAccion(f)} />
        ))}
      </View>
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : datos.length === 0 ? <Vacio titulo="Sin eventos" /> : (
        <Tarjeta style={{ padding: 0 }}>
          {datos.map((a) => (
            <View key={a.id} style={{ padding: espacio.md, borderBottomWidth: 1, borderBottomColor: colores.borde }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[tipo.cuerpo, { fontWeight: '700' }]}>{a.accion}</Text>
                <Text style={tipo.nota}>{fechaHora(a.fecha)}</Text>
              </View>
              <Text style={tipo.secundario}>{a.entidad}{a.entidad_id ? ` · ${a.entidad_id.slice(0, 8)}` : ''} · {a.usuario_nombre ?? 'sistema'}</Text>
              {a.detalle ? <Text style={tipo.nota}>{a.detalle}</Text> : null}
            </View>
          ))}
        </Tarjeta>
      )}
      {datos && datos.length >= limite ? <Boton titulo="Cargar más" variante="secundario" onPress={() => setLimite((l) => l + 100)} /> : null}
    </Pantalla>
  );
}
