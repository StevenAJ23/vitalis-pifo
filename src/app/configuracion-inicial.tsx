import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccion } from '../components/hooks';
import { Aviso, Boton, Campo, Tarjeta } from '../components/ui';
import { usuarioFormSchema, type UsuarioForm } from '../schemas/otros';
import { crearAdminInicial } from '../services/authService';
import { mensajeError } from '../services/contexto';
import { iniciarSesionEnStore, recargarAjustes, useDb } from '../state/app';
import { colores, espacio, tipo } from '../theme';

export default function ConfiguracionInicial() {
  const db = useDb();
  const { ocupado, ejecutar } = useAccion();
  const [error, setError] = React.useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<UsuarioForm>({
    resolver: zodResolver(usuarioFormSchema),
    defaultValues: { nombre: '', usuario: '', rol: 'ADMIN', clave: '', confirmacion: '' },
  });

  const guardar = handleSubmit((v) =>
    ejecutar(async () => {
      try {
        const u = await crearAdminInicial(db, { nombre: v.nombre, usuario: v.usuario, clave: v.clave });
        await recargarAjustes();
        iniciarSesionEnStore(u);
      } catch (e) {
        setError(mensajeError(e));
      }
    }),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }}>
      <ScrollView contentContainerStyle={{ padding: espacio.lg, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 560 }}>
          <View style={{ alignItems: 'center', marginVertical: espacio.lg }}>
            <ShieldCheck size={40} color={colores.primario} />
            <Text style={[tipo.titulo, { marginTop: espacio.sm }]}>Configuración inicial</Text>
            <Text style={[tipo.secundario, { textAlign: 'center' }]}>Cree la cuenta de administrador del dispositivo.</Text>
          </View>
          <Aviso
            tono="info"
            texto="La app inicia en MODO DE PRUEBA: use solo datos ficticios hasta verificar cifrado, autenticación, respaldo y la autorización del consultorio (Ajustes › Seguridad)."
          />
          <Tarjeta>
            {(['nombre', 'usuario'] as const).map((k) => (
              <Controller
                key={k}
                control={control}
                name={k}
                render={({ field }) => (
                  <Campo
                    etiqueta={k === 'nombre' ? 'Nombre completo' : 'Usuario'}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    autoCapitalize={k === 'usuario' ? 'none' : 'words'}
                    autoCorrect={false}
                    error={errors[k]?.message}
                    requerido
                  />
                )}
              />
            ))}
            <Controller control={control} name="clave" render={({ field }) => (
              <Campo etiqueta="Contraseña" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" error={errors.clave?.message} ayuda="Mínimo 8 caracteres con letras y números." requerido />
            )} />
            <Controller control={control} name="confirmacion" render={({ field }) => (
              <Campo etiqueta="Confirmar contraseña" value={field.value} onChangeText={field.onChange} secureTextEntry autoCapitalize="none" error={errors.confirmacion?.message} requerido />
            )} />
            {error ? <Aviso tono="peligro" texto={error} /> : null}
            <Boton titulo="Crear administrador" onPress={guardar} cargando={ocupado} grande />
          </Tarjeta>
          <Text style={[tipo.nota, { textAlign: 'center' }]}>
            La contraseña se protege con PBKDF2 y la base de datos se cifra con una clave guardada en el almacén seguro del sistema.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
