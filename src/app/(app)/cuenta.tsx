import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useAccion } from '../../components/hooks';
import { Aviso, Boton, Campo, Pantalla, Tarjeta, notificar } from '../../components/ui';
import { cambioClaveSchema, type CambioClaveForm } from '../../schemas/otros';
import { cambiarClave } from '../../services/authService';
import { mensajeError } from '../../services/contexto';
import { useActor, useDb } from '../../state/app';

export default function Cuenta() {
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<CambioClaveForm>({
    resolver: zodResolver(cambioClaveSchema),
    defaultValues: { actual: '', nueva: '', confirmacion: '' },
  });
  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      try {
        await cambiarClave(db, actor, v.actual, v.nueva);
        notificar('Contraseña actualizada');
        router.back();
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );
  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Cambiar contraseña' }} />
      <Tarjeta>
        {(['actual', 'nueva', 'confirmacion'] as const).map((k) => (
          <Controller key={k} control={control} name={k} render={({ field }) => (
            <Campo
              etiqueta={k === 'actual' ? 'Contraseña actual' : k === 'nueva' ? 'Nueva contraseña' : 'Confirmar nueva contraseña'}
              value={field.value}
              onChangeText={field.onChange}
              secureTextEntry
              autoCapitalize="none"
              error={errors[k]?.message}
            />
          )} />
        ))}
        {error ? <Aviso tono="peligro" texto={error} /> : null}
        <Boton titulo="Guardar" onPress={guardar} cargando={ocupado} />
      </Tarjeta>
    </Pantalla>
  );
}
