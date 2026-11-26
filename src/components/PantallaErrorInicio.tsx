import { DatabaseZap } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { eliminarBaseDatos } from '../db/expoDb';
import { eliminarClaveBd } from '../security/keyStore';
import { iniciarApp } from '../state/app';
import { colores, espacio, tipo } from '../theme';
import { Aviso, Boton, Campo, Tarjeta, confirmar } from './ui';

/**
 * Error al abrir la base (p. ej. clave perdida tras restablecer el almacén seguro).
 * Ofrece reintentar o, como último recurso y con doble confirmación, reiniciar la base local.
 */
export function PantallaErrorInicio({ mensaje }: { mensaje: string }) {
  const [texto, setTexto] = useState('');
  const reiniciar = async () => {
    const ok = await confirmar('Eliminar base local', 'Se borrarán TODOS los datos de este dispositivo. Solo continúe si dispone de un respaldo cifrado.', { textoOk: 'Eliminar', destructivo: true });
    if (!ok) return;
    await eliminarBaseDatos();
    await eliminarClaveBd();
    await iniciarApp();
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }}>
      <ScrollView contentContainerStyle={{ padding: espacio.lg }}>
        <Tarjeta>
          <View style={{ alignItems: 'center', marginBottom: espacio.md }}>
            <DatabaseZap size={36} color={colores.peligro} />
          </View>
          <Text style={[tipo.titulo, { textAlign: 'center' }]}>No se pudo abrir la base de datos</Text>
          <Aviso tono="peligro" texto={mensaje} />
          <Text style={tipo.secundario}>
            Cierre y vuelva a abrir la aplicación. Si el problema persiste, la clave de cifrado puede haberse perdido (por ejemplo, tras
            restablecer la seguridad del dispositivo). En ese caso los datos cifrados no pueden recuperarse sin un respaldo.
          </Text>
          <Boton titulo="Reintentar" onPress={() => void iniciarApp()} estilo={{ marginVertical: espacio.md }} />
          <Campo etiqueta='Para reiniciar la base escriba "BORRAR"' value={texto} onChangeText={setTexto} autoCapitalize="characters" />
          <Boton titulo="Reiniciar base local" variante="peligro" deshabilitado={texto !== 'BORRAR'} onPress={reiniciar} />
        </Tarjeta>
      </ScrollView>
    </SafeAreaView>
  );
}
