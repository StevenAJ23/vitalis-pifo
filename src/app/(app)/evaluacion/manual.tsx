import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { Play, RefreshCw, Square } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';
import { useAccion } from '../../../components/hooks';
import { Aviso, Boton, Campo, Fila, Interruptor, Pantalla, Segmentado, Tarjeta, notificar } from '../../../components/ui';
import { formatearDuracion } from '../../../domain/stats';
import { evaluacionManualSchema, type EvaluacionManualForm } from '../../../schemas/otros';
import { mensajeError } from '../../../services/contexto';
import { registrarManual } from '../../../services/evaluacionService';
import { useActor, useApp, useDb } from '../../../state/app';
import { colores, espacio, tipo } from '../../../theme';

/** Registro de tiempos del grupo manual (papel o Excel) con cronómetro integrado. */
export default function EvaluacionManual() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const { ocupado, ejecutar } = useAccion();
  const [inicio, setInicio] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);
  const [inicioMedido, setInicioMedido] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, setValue, reset, formState: { errors } } = useForm<EvaluacionManualForm>({
    resolver: zodResolver(evaluacionManualSchema),
    defaultValues: { metodo: 'PAPEL', operador: '', duracion_s: '', tiempo_busqueda_s: '', incompletos: '0', errores_verificados: '', correcciones: '0', conectividad: 'SIN_CONEXION', guardado_exitoso: true },
  });

  useEffect(() => {
    if (!inicio) return;
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, [inicio]);

  const iniciar = () => {
    const t = Date.now();
    setInicioMedido(t);
    setInicio(t);
    setAhora(t);
  };
  const detener = () => {
    if (!inicio) return;
    setValue('duracion_s', ((Date.now() - inicio) / 1000).toFixed(1), { shouldValidate: true });
    setInicio(null);
  };

  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      setError(null);
      try {
        await registrarManual(db, actor, campanaActiva?.id ?? '', v, inicioMedido ?? undefined);
        notificar('Registro guardado en la matriz');
        reset({ ...v, duracion_s: '', tiempo_busqueda_s: '', incompletos: '0', errores_verificados: '', correcciones: '0' });
        setInicioMedido(null);
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Registro papel / Excel' }} />
      <Tarjeta style={{ alignItems: 'center' }}>
        <Text style={tipo.etiqueta}>Cronómetro de ingreso</Text>
        <Text style={{ fontSize: 48, fontWeight: '800', color: inicio ? colores.acento : colores.texto, fontVariant: ['tabular-nums'] }}>
          {inicio ? formatearDuracion(ahora - inicio) : '00:00'}
        </Text>
        <Fila>
          {inicio ? (
            <Boton titulo="Detener (guardado)" icono={Square} variante="peligro" onPress={detener} />
          ) : (
            <Boton titulo="Iniciar ingreso" icono={Play} variante="acento" onPress={iniciar} />
          )}
          <Boton titulo="" icono={RefreshCw} variante="fantasma" etiquetaAccesible="Reiniciar cronómetro" onPress={() => { setInicio(null); setValue('duracion_s', ''); }} />
        </Fila>
        <Text style={[tipo.nota, { marginTop: espacio.sm, textAlign: 'center' }]}>Inicie al comenzar a escribir y detenga al terminar de guardar (sin incluir la medición).</Text>
      </Tarjeta>
      <Tarjeta>
        <Controller control={control} name="metodo" render={({ field }) => (
          <Segmentado etiqueta="Método" valor={field.value} onCambio={field.onChange} opciones={[{ valor: 'PAPEL', texto: 'Papel' }, { valor: 'EXCEL', texto: 'Excel' }]} />
        )} />
        <Controller control={control} name="operador" render={({ field }) => (
          <Campo etiqueta="Código de operador" value={field.value} onChangeText={field.onChange} autoCapitalize="characters" placeholder="OP-03" error={errors.operador?.message} ayuda="Use un código, nunca el nombre." requerido />
        )} />
        <View style={{ flexDirection: 'row', gap: espacio.md }}>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="duracion_s" render={({ field }) => (
              <Campo etiqueta="Tiempo de ingreso" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" unidad="s" error={errors.duracion_s?.message} requerido />
            )} />
          </View>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="tiempo_busqueda_s" render={({ field }) => (
              <Campo etiqueta="Tiempo de búsqueda" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" unidad="s" error={errors.tiempo_busqueda_s?.message} />
            )} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: espacio.md }}>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="incompletos" render={({ field }) => (
              <Campo etiqueta="Campos faltantes" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" error={errors.incompletos?.message} />
            )} />
          </View>
          <View style={{ flex: 1 }}>
            <Controller control={control} name="correcciones" render={({ field }) => (
              <Campo etiqueta="Correcciones" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" error={errors.correcciones?.message} />
            )} />
          </View>
        </View>
        <Controller control={control} name="errores_verificados" render={({ field }) => (
          <Campo etiqueta="Errores verificados contra la ficha fuente" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" error={errors.errores_verificados?.message} ayuda="Puede completarse después de la verificación." />
        )} />
        <Controller control={control} name="conectividad" render={({ field }) => (
          <Segmentado etiqueta="Conectividad" valor={field.value} onCambio={field.onChange} opciones={[{ valor: 'SIN_CONEXION', texto: 'Sin conexión' }, { valor: 'EN_LINEA', texto: 'En línea' }, { valor: 'DESCONOCIDA', texto: 'N/D' }]} />
        )} />
        <Controller control={control} name="guardado_exitoso" render={({ field }) => (
          <Interruptor etiqueta="Guardado exitoso" valor={field.value} onCambio={field.onChange} />
        )} />
      </Tarjeta>
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      <Boton titulo="Guardar registro" grande onPress={guardar} cargando={ocupado} deshabilitado={!!inicio} />
      <Boton titulo="Volver a la matriz" variante="fantasma" onPress={() => router.back()} estilo={{ marginTop: espacio.sm }} />
    </Pantalla>
  );
}
