import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { useAccion, useCarga } from '../../../components/hooks';
import { Aviso, Boton, Campo, Cargando, ErrorVista, Interruptor, Pantalla, Seccion, Segmentado, Tarjeta, avisar } from '../../../components/ui';
import type { Rol } from '../../../domain/types';
import * as usuariosRepo from '../../../repositories/usuarios';
import { usuarioFormSchema, type UsuarioForm } from '../../../schemas/otros';
import { NOMBRE_ROL } from '../../../security/permissions';
import { validarPoliticaClave } from '../../../security/passwords';
import { actualizarUsuario, crearUsuario, restablecerClave } from '../../../services/authService';
import { mensajeError } from '../../../services/contexto';
import { useActor, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

const ROLES = (['OPERADOR', 'MEDICO', 'ANALISTA', 'ADMIN'] as Rol[]).map((r) => ({ valor: r, texto: NOMBRE_ROL[r].split(' ')[0] }));

function NuevoUsuario() {
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<UsuarioForm>({
    resolver: zodResolver(usuarioFormSchema),
    defaultValues: { nombre: '', usuario: '', rol: 'OPERADOR', clave: '', confirmacion: '' },
  });
  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      try {
        await crearUsuario(db, actor, v);
        avisar('Usuario creado', 'Deberá cambiar la contraseña temporal en su primer inicio de sesión.', 'exito');
        router.back();
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );
  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Nuevo usuario' }} />
      <Tarjeta>
        <Controller control={control} name="nombre" render={({ field }) => <Campo etiqueta="Nombre completo" value={field.value} onChangeText={field.onChange} error={errors.nombre?.message} requerido />} />
        <Controller control={control} name="usuario" render={({ field }) => <Campo etiqueta="Usuario" value={field.value} onChangeText={field.onChange} autoCapitalize="none" error={errors.usuario?.message} requerido />} />
        <Controller control={control} name="rol" render={({ field }) => <Segmentado etiqueta="Rol" valor={field.value} onCambio={field.onChange} opciones={ROLES} />} />
        <Controller control={control} name="clave" render={({ field }) => <Campo etiqueta="Contraseña temporal" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" error={errors.clave?.message} requerido />} />
        <Controller control={control} name="confirmacion" render={({ field }) => <Campo etiqueta="Confirmar contraseña" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" error={errors.confirmacion?.message} requerido />} />
        {error ? <Aviso tono="peligro" texto={error} /> : null}
        <Boton titulo="Crear usuario" onPress={guardar} cargando={ocupado} />
      </Tarjeta>
    </Pantalla>
  );
}

function EditarUsuario({ id }: { id: string }) {
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [temporal, setTemporal] = useState('');
  const [form, setForm] = useState<{ nombre: string; rol: Rol; activo: boolean } | null>(null);
  const { datos, error, recargar } = useCarga(async () => {
    const u = await usuariosRepo.porId(db, id);
    if (!u) throw new Error('Usuario no encontrado');
    setForm({ nombre: u.nombre, rol: u.rol, activo: u.activo === 1 });
    return u;
  }, [id]);

  if (error) return <Pantalla><ErrorVista mensaje={error} reintentar={recargar} /></Pantalla>;
  if (!datos || !form) return <Pantalla><Cargando /></Pantalla>;
  return (
    <Pantalla>
      <Stack.Screen options={{ title: datos.nombre }} />
      <Tarjeta>
        <Text style={tipo.secundario}>@{datos.usuario} · {datos.codigo_operador}</Text>
        <Campo etiqueta="Nombre" value={form.nombre} onChangeText={(t) => setForm({ ...form, nombre: t })} />
        <Segmentado etiqueta="Rol" valor={form.rol} onCambio={(r) => setForm({ ...form, rol: r })} opciones={ROLES} />
        <Interruptor etiqueta="Cuenta activa" valor={form.activo} onCambio={(a) => setForm({ ...form, activo: a })} deshabilitado={datos.id === actor.id} />
        <Boton
          titulo="Guardar cambios"
          cargando={ocupado}
          onPress={() =>
            ejecutar(async () => {
              try {
                if (form.nombre.trim().length < 3) throw new Error('Nombre demasiado corto');
                await actualizarUsuario(db, actor, id, form);
                setMensaje('Cambios guardados.');
                await recargar();
              } catch (e) {
                setMensaje(mensajeError(e));
              }
            })
          }
        />
      </Tarjeta>
      <Seccion titulo="Restablecer contraseña">
        <Tarjeta>
          <Campo etiqueta="Contraseña temporal" value={temporal} onChangeText={setTemporal} secureTextEntry autoCapitalize="none" error={temporal ? validarPoliticaClave(temporal) ?? undefined : undefined} ayuda="El usuario deberá cambiarla al iniciar sesión. En cuentas restauradas desde respaldo, active además la cuenta." />
          <Boton
            titulo="Restablecer"
            variante="secundario"
            deshabilitado={!temporal || !!validarPoliticaClave(temporal)}
            cargando={ocupado}
            onPress={() =>
              ejecutar(async () => {
                try {
                  await restablecerClave(db, actor, id, temporal);
                  setTemporal('');
                  setMensaje('Contraseña restablecida.');
                  await recargar();
                } catch (e) {
                  setMensaje(mensajeError(e));
                }
              })
            }
          />
        </Tarjeta>
      </Seccion>
      {mensaje ? <Aviso tono="info" texto={mensaje} /> : null}
      <Boton titulo="Volver" variante="fantasma" onPress={() => router.back()} estilo={{ marginTop: espacio.sm }} />
    </Pantalla>
  );
}

export default function FormUsuario() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <EditarUsuario id={id} /> : <NuevoUsuario />;
}
