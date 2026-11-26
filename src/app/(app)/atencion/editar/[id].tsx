import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FormularioAtencion } from '../../../../components/FormularioAtencion';
import { useAccion, useCarga } from '../../../../components/hooks';
import { Aviso, Cargando, ErrorVista, Pantalla, notificar } from '../../../../components/ui';
import { formDesdeAtencion } from '../../../../schemas/atencion';
import * as atencionService from '../../../../services/atencionService';
import { mensajeError } from '../../../../services/contexto';
import { useActor, useDb } from '../../../../state/app';

export default function CorregirAtencion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const { datos, error: errCarga, recargar } = useCarga(() => atencionService.obtener(db, actor, id), [id]);

  if (errCarga) return <Pantalla><ErrorVista mensaje={errCarga} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Corregir · ${datos.paciente_codigo}` }} />
      <Aviso tono="info" texto="La corrección guarda la versión anterior y registra en la auditoría qué campos cambiaron." />
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      <FormularioAtencion
        inicial={formDesdeAtencion(datos)}
        correccion
        ocupado={ocupado}
        onGuardar={(form, atipicosConfirmados) =>
          ejecutar(async () => {
            setError(null);
            try {
              await atencionService.corregir(db, actor, { id, form, versionEsperada: datos.version, motivo: form.motivo_correccion, atipicosConfirmados });
              notificar('Corrección guardada · nueva versión registrada');
              router.back();
            } catch (e) {
              setError(mensajeError(e));
            }
          })
        }
      />
    </Pantalla>
  );
}
