import { Ban } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { espacio } from '../theme';
import { useAccion } from './hooks';
import { Boton, Campo, Tarjeta, confirmar } from './ui';

/** Anulación lógica con motivo obligatorio (no hay borrado físico). Funciona en Android (sin Alert.prompt). */
export function Anulacion({ titulo, onAnular }: { titulo: string; onAnular: (motivo: string) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const { ocupado, ejecutar } = useAccion();
  if (!abierto) return <Boton titulo={titulo} icono={Ban} variante="fantasma" onPress={() => setAbierto(true)} />;
  return (
    <Tarjeta>
      <Campo etiqueta="Motivo de la anulación" value={motivo} onChangeText={setMotivo} multiline maxLength={200} ayuda="Queda registrado en la auditoría. El registro no se borra." />
      <View style={{ flexDirection: 'row', gap: espacio.sm }}>
        <Boton titulo="Cancelar" variante="secundario" onPress={() => setAbierto(false)} estilo={{ flex: 1 }} />
        <Boton
          titulo="Anular"
          variante="peligro"
          deshabilitado={motivo.trim().length < 5}
          cargando={ocupado}
          estilo={{ flex: 1 }}
          onPress={() =>
            ejecutar(async () => {
              if (await confirmar('Confirmar anulación', '¿Desea anular este registro?', { textoOk: 'Anular', destructivo: true })) {
                await onAnular(motivo.trim());
                setAbierto(false);
              }
            })
          }
        />
      </View>
    </Tarjeta>
  );
}
