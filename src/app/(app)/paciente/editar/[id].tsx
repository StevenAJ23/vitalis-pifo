import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FormularioPaciente } from '../../../../components/FormularioPaciente';
import { useAccion, useCarga } from '../../../../components/hooks';
import { Aviso, Cargando, ErrorVista, Pantalla, notificar } from '../../../../components/ui';
import type { PacienteForm } from '../../../../schemas/paciente';
import { mensajeError } from '../../../../services/contexto';
import * as pacienteService from '../../../../services/pacienteService';
import { useActor, useDb } from '../../../../state/app';

export default function EditarPaciente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const { datos, error: errCarga, recargar } = useCarga(() => pacienteService.obtenerFicha(db, actor, id), [id]);

  if (errCarga) return <Pantalla><ErrorVista mensaje={errCarga} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const p = datos;
  const inicial: PacienteForm = {
    nombres: p.nombres,
    apellidos: p.apellidos,
    edad: p.edad != null ? String(p.edad) : '',
    sector: p.sector,
    telefono: p.telefono ?? '',
    cedula: p.campos_opcionales.cedula ?? '',
    fecha_nacimiento: p.campos_opcionales.fecha_nacimiento ?? '',
    sexo: p.campos_opcionales.sexo ?? '',
    consentimiento_contacto: p.consentimiento_contacto,
    canal_preferido: p.canal_preferido,
  };

  return (
    <Pantalla>
      <Stack.Screen options={{ title: `Editar ${p.codigo}` }} />
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      <FormularioPaciente
        inicial={inicial}
        textoGuardar="Guardar cambios"
        ocupado={ocupado}
        onGuardar={(v) =>
          ejecutar(async () => {
            try {
              await pacienteService.actualizar(db, actor, id, v);
              notificar('Cambios guardados');
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
