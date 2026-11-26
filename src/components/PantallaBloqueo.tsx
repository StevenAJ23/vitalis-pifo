import { Fingerprint, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auditar } from '../repositories/auditoria';
import * as biometria from '../security/biometria';
import { desbloquearBiometrico, verificarParaDesbloqueo } from '../services/authService';
import { mensajeAccesoRapido, mensajeError } from '../services/contexto';
import { appStore, cerrarSesionEnStore, desbloquearSesion, usuarioBiometrico, useSesion } from '../state/app';
import { colores, espacio, tipo } from '../theme';
import { BarraEstado } from './BarraEstado';
import { useAccion } from './hooks';
import { Boton, Campo, Tarjeta } from './ui';

/** Bloqueo por inactividad: cubre toda la app; el recorrido GPS continúa en curso. */
export function PantallaBloqueo() {
  const { usuario } = useSesion();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | undefined>();
  const { ocupado, ejecutar } = useAccion();
  const bio = usuarioBiometrico(appStore.get().ajustes);
  const puedeBio = !!usuario && bio?.id === usuario.id;
  const [bioNombre, setBioNombre] = useState<string | null>(null);

  const desbloquearBio = () =>
    ejecutar(async () => {
      const db = appStore.get().db;
      if (!db || !usuario) return;
      try {
        const token = await biometria.obtenerToken(usuario.id, 'Desbloquear Vitalis Pifo');
        await desbloquearBiometrico(db, usuario.id, token);
        setError(undefined);
        desbloquearSesion();
      } catch (e) {
        setError(mensajeAccesoRapido(e));
      }
    });

  useEffect(() => {
    if (!puedeBio) return;
    let vivo = true;
    void biometria.disponibilidad().then((d) => {
      if (!vivo || !d.disponible) return;
      setBioNombre(d.nombre);
      void desbloquearBio();
    });
    return () => {
      vivo = false;
    };
  }, [puedeBio]); // eslint-disable-line react-hooks/exhaustive-deps

  const desbloquear = () =>
    ejecutar(async () => {
      const db = appStore.get().db;
      if (!db || !usuario) return;
      try {
        await verificarParaDesbloqueo(db, usuario.id, clave);
        setClave('');
        setError(undefined);
        desbloquearSesion();
      } catch (e) {
        setError(mensajeError(e));
        setClave('');
      }
    });

  const salir = async () => {
    const db = appStore.get().db;
    if (db && usuario) await auditar(db, { usuarioId: usuario.id, entidad: 'sesion', accion: 'LOGOUT', detalle: 'desde bloqueo' });
    cerrarSesionEnStore();
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colores.fondo }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BarraEstado />
        <View style={estilos.centro}>
          <Tarjeta style={{ width: '100%', maxWidth: 420 }}>
            <View style={estilos.icono}>
              <Lock size={26} color={colores.primario} />
            </View>
            <Text style={[tipo.titulo, { textAlign: 'center' }]}>Sesión bloqueada</Text>
            <Text style={[tipo.secundario, { textAlign: 'center', marginBottom: espacio.lg }]}>
              Por inactividad. {usuario?.nombre}, ingrese su contraseña para continuar.
            </Text>
            <Campo
              etiqueta="Contraseña"
              value={clave}
              onChangeText={setClave}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              error={error}
              onSubmitEditing={desbloquear}
              returnKeyType="go"
            />
            <Boton titulo="Desbloquear" onPress={desbloquear} cargando={ocupado} deshabilitado={!clave} grande />
            {puedeBio && bioNombre ? (
              <Boton titulo={`Desbloquear con ${bioNombre}`} icono={Fingerprint} variante="secundario" grande onPress={desbloquearBio} deshabilitado={ocupado} estilo={{ marginTop: espacio.sm }} />
            ) : null}
            <Boton titulo="Cerrar sesión" variante="fantasma" onPress={salir} estilo={{ marginTop: espacio.sm }} />
          </Tarjeta>
        </View>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg },
  icono: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.md },
});
