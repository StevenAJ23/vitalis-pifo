import { router } from 'expo-router';
import { BookOpen, Fingerprint, HeartPulse } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccion } from '../components/hooks';
import { Aviso, Boton, Campo, Tarjeta } from '../components/ui';
import { fechaHora } from '../domain/time';
import type { Usuario } from '../domain/types';
import * as biometria from '../security/biometria';
import { cambiarClave, ErrorAutenticacion, aActor, iniciarSesion, iniciarSesionBiometrica } from '../services/authService';
import { mensajeAccesoRapido, mensajeError } from '../services/contexto';
import { iniciarSesionEnStore, useApp, useDb, usuarioBiometrico } from '../state/app';
import { guardarAjuste } from '../repositories/ajustes';
import { colores, espacio, tipo } from '../theme';

export default function Login() {
  const db = useDb();
  const app = useApp();
  const [usuario, setUsuario] = useState(app.ajustes.ultimo_usuario);
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<Usuario | null>(null);
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const { ocupado, ejecutar } = useAccion();
  const bio = usuarioBiometrico(app.ajustes);
  const [bioNombre, setBioNombre] = useState<string | null>(null);

  const entrarBiometria = () =>
    ejecutar(async () => {
      if (!bio) return;
      setError(null);
      try {
        const token = await biometria.obtenerToken(bio.id);
        const u = await iniciarSesionBiometrica(db, bio.id, token);
        iniciarSesionEnStore(u);
      } catch (e) {
        setError(mensajeAccesoRapido(e));
      }
    });

  // Si hay acceso biométrico configurado y disponible, se ofrece de inmediato al abrir.
  useEffect(() => {
    if (!bio) return;
    let vivo = true;
    void biometria.disponibilidad().then((d) => {
      if (!vivo || !d.disponible) return;
      setBioNombre(d.nombre);
      void entrarBiometria();
    });
    return () => {
      vivo = false;
    };
  }, [bio?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = () =>
    ejecutar(async () => {
      setError(null);
      try {
        const u = await iniciarSesion(db, usuario, clave);
        if (u.debe_cambiar_clave) {
          setPendiente(u);
          return;
        }
        setClave('');
        await guardarAjuste(db, 'ultimo_usuario', u.usuario);
        iniciarSesionEnStore(u);
      } catch (e) {
        if (e instanceof ErrorAutenticacion && e.bloqueadoHasta) setError(`${e.message} Hasta ${fechaHora(e.bloqueadoHasta)}.`);
        else setError(mensajeError(e));
        setClave('');
      }
    });

  const cambiar = () =>
    ejecutar(async () => {
      if (!pendiente) return;
      if (nueva !== confirmacion) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      try {
        await cambiarClave(db, aActor(pendiente), clave, nueva);
        iniciarSesionEnStore({ ...pendiente, debe_cambiar_clave: 0 });
      } catch (e) {
        setError(mensajeError(e));
      }
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colores.primario }}>
      <ScrollView contentContainerStyle={estilos.cont} keyboardShouldPersistTaps="handled">
        <View style={estilos.marca}>
          <View style={estilos.logo}>
            <HeartPulse size={34} color={colores.primario} />
          </View>
          <Text style={estilos.nombre}>Vitalis Pifo</Text>
          <Text style={estilos.lema}>Registro de campaña comunitaria · funciona sin internet</Text>
        </View>
        <Tarjeta style={{ width: '100%', maxWidth: 440 }}>
          {pendiente ? (
            <>
              <Text style={tipo.subtitulo}>Cambie su contraseña temporal</Text>
              <Text style={[tipo.secundario, { marginBottom: espacio.md }]}>Mínimo 8 caracteres, con letras y números.</Text>
              <Campo etiqueta="Nueva contraseña" value={nueva} onChangeText={setNueva} secureTextEntry autoCapitalize="none" />
              <Campo etiqueta="Confirmar contraseña" value={confirmacion} onChangeText={setConfirmacion} secureTextEntry autoCapitalize="none" />
              {error ? <Aviso tono="peligro" texto={error} /> : null}
              <Boton titulo="Guardar y entrar" onPress={cambiar} cargando={ocupado} deshabilitado={!nueva || !confirmacion} grande />
            </>
          ) : (
            <>
              <Text style={[tipo.subtitulo, { marginBottom: espacio.md }]}>Iniciar sesión</Text>
              <Campo etiqueta="Usuario" value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoCorrect={false} textContentType="username" returnKeyType="next" />
              <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" onSubmitEditing={entrar} returnKeyType="go" />
              {error ? <Aviso tono="peligro" texto={error} /> : null}
              <Boton titulo="Entrar" onPress={entrar} cargando={ocupado} deshabilitado={!usuario || !clave} grande />
              {bio && bioNombre ? (
                <Boton
                  titulo={`Entrar con ${bioNombre}${bio.nombre ? ` · ${bio.nombre.split(' ')[0]}` : ''}`}
                  icono={Fingerprint}
                  variante="secundario"
                  grande
                  onPress={entrarBiometria}
                  deshabilitado={ocupado}
                  estilo={{ marginTop: espacio.sm }}
                />
              ) : null}
              <Boton titulo="¿Cómo se usa la app?" icono={BookOpen} variante="fantasma" onPress={() => router.push('/manual')} estilo={{ marginTop: espacio.sm }} />
              <Text style={[tipo.nota, { marginTop: espacio.md, textAlign: 'center' }]}>
                {app.cifrado.sqlcipher ? `Base cifrada · SQLCipher ${app.cifrado.version}` : 'Atención: base sin cifrado verificado (use la compilación nativa)'}
              </Text>
            </>
          )}
        </Tarjeta>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  cont: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg },
  marca: { alignItems: 'center', marginBottom: espacio.xl },
  logo: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: espacio.md },
  nombre: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  lema: { color: '#CFE6E2', fontSize: 14, marginTop: 4, textAlign: 'center' },
});
