import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useAccion } from '../../../components/hooks';
import { Aviso, Boton, Campo, Cargando, Pantalla, Segmentado, Tarjeta } from '../../../components/ui';
import { fechaISO } from '../../../domain/time';
import { campanaFormSchema, type CampanaForm } from '../../../schemas/otros';
import * as campanaService from '../../../services/campanaService';
import { mensajeError } from '../../../services/contexto';
import { recargarAjustes, useActor, useDb } from '../../../state/app';

export default function FormCampana() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(!id);
  const [hoy] = useState(() => fechaISO(Date.now()));
  const { control, handleSubmit, reset, formState: { errors } } = useForm<CampanaForm>({
    resolver: zodResolver(campanaFormSchema),
    defaultValues: { nombre: '', sector: 'Pifo', inicio: hoy, fin: '', descripcion: '', responsable: actor.nombre, estado: 'ACTIVA' },
  });

  useEffect(() => {
    if (!id) return;
    campanaService.obtener(db, id).then((c) => {
      if (c) reset({ nombre: c.nombre, sector: c.sector, inicio: c.inicio, fin: c.fin ?? '', descripcion: c.descripcion ?? '', responsable: c.responsable, estado: c.estado });
      setListo(true);
    }).catch((e) => setError(mensajeError(e)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      setError(null);
      try {
        if (id) await campanaService.actualizar(db, actor, id, v);
        else await campanaService.crear(db, actor, v);
        await recargarAjustes();
        router.back();
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );

  if (!listo) return <Pantalla><Cargando /></Pantalla>;
  return (
    <Pantalla>
      <Stack.Screen options={{ title: id ? 'Editar campaña' : 'Nueva campaña' }} />
      <Tarjeta>
        <Controller control={control} name="nombre" render={({ field }) => <Campo etiqueta="Nombre" value={field.value} onChangeText={field.onChange} error={errors.nombre?.message} requerido />} />
        <Controller control={control} name="sector" render={({ field }) => <Campo etiqueta="Sector" value={field.value} onChangeText={field.onChange} error={errors.sector?.message} requerido />} />
        <Controller control={control} name="inicio" render={({ field }) => <Campo etiqueta="Fecha inicial" value={field.value} onChangeText={field.onChange} placeholder="AAAA-MM-DD" maxLength={10} error={errors.inicio?.message} requerido />} />
        <Controller control={control} name="fin" render={({ field }) => <Campo etiqueta="Fecha final" value={field.value} onChangeText={field.onChange} placeholder="AAAA-MM-DD" maxLength={10} error={errors.fin?.message} />} />
        <Controller control={control} name="responsable" render={({ field }) => <Campo etiqueta="Responsable" value={field.value} onChangeText={field.onChange} error={errors.responsable?.message} requerido />} />
        <Controller control={control} name="descripcion" render={({ field }) => <Campo etiqueta="Descripción" value={field.value} onChangeText={field.onChange} multiline maxLength={400} error={errors.descripcion?.message} />} />
        <Controller control={control} name="estado" render={({ field }) => (
          <Segmentado etiqueta="Estado" valor={field.value} onCambio={field.onChange} opciones={[{ valor: 'PLANIFICADA', texto: 'Planificada' }, { valor: 'ACTIVA', texto: 'Activa' }, { valor: 'CERRADA', texto: 'Cerrada' }, { valor: 'ARCHIVADA', texto: 'Archivada' }]} />
        )} />
      </Tarjeta>
      <Aviso tono="info" texto="Las campañas no se eliminan: ciérrelas o archívelas para conservar el historial." />
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      <Boton titulo="Guardar campaña" grande onPress={guardar} cargando={ocupado} />
    </Pantalla>
  );
}
