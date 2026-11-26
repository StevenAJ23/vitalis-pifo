import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { useAccion, useCarga } from '../../../components/hooks';
import { Aviso, Boton, Campo, DatoFila, Pantalla, Seccion, Segmentado, Tarjeta, notificar } from '../../../components/ui';
import { fechaHora } from '../../../domain/time';
import { sesionSchema, type SesionForm } from '../../../schemas/otros';
import { mensajeError } from '../../../services/contexto';
import { registrarSesion } from '../../../services/evaluacionService';
import * as evalRepo from '../../../repositories/evaluacion';
import { useActor, useApp, useDb } from '../../../state/app';
import { colores, espacio, radio, tipo } from '../../../theme';

/** Encuesta por operador y método: satisfacción 1–5, tiempo de consolidación y consumo de papel. */
export default function EncuestaSesion() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const previas = useCarga(() => evalRepo.sesiones(db, campanaActiva?.id ?? null), [campanaActiva?.id]);
  const { control, handleSubmit, formState: { errors } } = useForm<SesionForm>({
    resolver: zodResolver(sesionSchema),
    defaultValues: { metodo: 'DIGITAL', operador: actor.codigo_operador, satisfaccion: 0, tiempo_consolidacion_min: '', hojas_papel: '', notas: '' },
  });

  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      setError(null);
      try {
        await registrarSesion(db, actor, campanaActiva?.id ?? '', v);
        notificar('Encuesta registrada. ¡Gracias!');
        router.back();
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Encuesta de satisfacción' }} />
      <Tarjeta>
        <Controller control={control} name="metodo" render={({ field }) => (
          <Segmentado etiqueta="Método utilizado" valor={field.value} onCambio={field.onChange} opciones={[{ valor: 'DIGITAL', texto: 'App' }, { valor: 'PAPEL', texto: 'Papel' }, { valor: 'EXCEL', texto: 'Excel' }]} />
        )} />
        <Controller control={control} name="operador" render={({ field }) => (
          <Campo etiqueta="Código de operador" value={field.value} onChangeText={field.onChange} autoCapitalize="characters" error={errors.operador?.message} requerido />
        )} />
        <Text style={[tipo.etiqueta, { marginBottom: 6 }]}>Satisfacción (1 = muy baja, 5 = muy alta)</Text>
        <Controller control={control} name="satisfaccion" render={({ field }) => (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => field.onChange(n)}
                accessibilityRole="radio"
                accessibilityState={{ selected: field.value === n }}
                style={{ flex: 1, height: 52, borderRadius: radio.md, alignItems: 'center', justifyContent: 'center', backgroundColor: field.value === n ? colores.primario : colores.primarioSuave }}
              >
                <Text style={{ fontSize: 20, fontWeight: '700', color: field.value === n ? '#fff' : colores.primario }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        )} />
        {errors.satisfaccion ? <Text style={{ color: colores.peligro, marginBottom: espacio.sm }}>Elija un valor de 1 a 5</Text> : <View style={{ height: espacio.md }} />}
        <View style={{ flexDirection: 'row', gap: espacio.md }}>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="tiempo_consolidacion_min" render={({ field }) => (
              <Campo etiqueta="Consolidación" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" unidad="min" error={errors.tiempo_consolidacion_min?.message} />
            )} />
          </View>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="hojas_papel" render={({ field }) => (
              <Campo etiqueta="Hojas de papel" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" error={errors.hojas_papel?.message} />
            )} />
          </View>
        </View>
        <Controller control={control} name="notas" render={({ field }) => (
          <Campo etiqueta="Comentarios (sin datos personales)" value={field.value} onChangeText={field.onChange} multiline maxLength={300} error={errors.notas?.message} />
        )} />
      </Tarjeta>
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      <Boton titulo="Guardar encuesta" grande onPress={guardar} cargando={ocupado} />
      {(previas.datos?.length ?? 0) > 0 ? (
        <Seccion titulo="Encuestas registradas">
          <Tarjeta>
            {previas.datos!.map((s) => <DatoFila key={s.id} etiqueta={`${fechaHora(s.fecha)} · ${s.operador} · ${s.metodo}`} valor={`${s.satisfaccion}/5`} />)}
          </Tarjeta>
        </Seccion>
      ) : null}
    </Pantalla>
  );
}
