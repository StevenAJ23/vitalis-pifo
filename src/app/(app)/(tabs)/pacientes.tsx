import { router } from 'expo-router';
import { History, UserPlus } from 'lucide-react-native';
import { BuscadorPacientes } from '../../../components/BuscadorPacientes';
import { Boton, Fila, Pantalla } from '../../../components/ui';
import { puede } from '../../../security/permissions';
import { useActor } from '../../../state/app';
import { espacio } from '../../../theme';

export default function Pacientes() {
  const actor = useActor();
  return (
    <Pantalla>
      <Fila style={{ marginBottom: espacio.md }}>
        {puede(actor.rol, 'paciente.crear') ? (
          <Boton titulo="Nuevo paciente" icono={UserPlus} onPress={() => router.push('/paciente/nuevo')} estilo={{ flex: 1 }} />
        ) : null}
        {puede(actor.rol, 'historial.ver') ? (
          <Boton titulo="Historial" icono={History} variante="secundario" onPress={() => router.push('/historial')} estilo={{ flex: 1 }} />
        ) : null}
      </Fila>
      <BuscadorPacientes
        onElegir={(p) =>
          puede(actor.rol, 'paciente.ver_ficha')
            ? router.push({ pathname: '/paciente/[id]', params: { id: p.id } })
            : router.push({ pathname: '/atencion/nueva', params: { pacienteId: p.id } })
        }
        onCrear={puede(actor.rol, 'paciente.crear') ? () => router.push('/paciente/nuevo') : undefined}
      />
    </Pantalla>
  );
}
