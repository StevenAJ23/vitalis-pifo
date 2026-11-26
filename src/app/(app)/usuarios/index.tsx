import { router, Stack } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { useCarga } from '../../../components/hooks';
import { Boton, Cargando, ErrorVista, Fila, Insignia, Pantalla, Tarjeta } from '../../../components/ui';
import { fechaHora } from '../../../domain/time';
import * as usuariosRepo from '../../../repositories/usuarios';
import { exigir, MATRIZ_ROLES, NOMBRE_ROL } from '../../../security/permissions';
import { useActor, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

export default function Usuarios() {
  const db = useDb();
  const actor = useActor();
  const { datos, error, recargar } = useCarga(async () => {
    exigir(actor.rol, 'usuarios.gestionar');
    const ahora = Date.now();
    return (await usuariosRepo.listar(db)).map((u) => ({ ...u, bloqueado: !!u.bloqueado_hasta && u.bloqueado_hasta > ahora }));
  }, []);
  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Usuarios y roles' }} />
      <Boton titulo="Nuevo usuario" icono={UserPlus} onPress={() => router.push('/usuarios/form')} estilo={{ marginBottom: espacio.md }} />
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : datos.map((u) => (
        <Tarjeta key={u.id} onPress={() => router.push({ pathname: '/usuarios/form', params: { id: u.id } })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={tipo.subtitulo}>{u.nombre}</Text>
            <Insignia texto={u.codigo_operador} />
          </View>
          <Text style={tipo.secundario}>@{u.usuario} · {NOMBRE_ROL[u.rol]}</Text>
          <Fila style={{ marginTop: 6 }}>
            {u.activo ? <Insignia texto="Activo" tono="exito" /> : <Insignia texto="Inactivo" tono="peligro" />}
            {!u.tiene_credencial ? <Insignia texto="Sin contraseña (restaurado)" tono="aviso" /> : null}
            {u.debe_cambiar_clave ? <Insignia texto="Debe cambiar contraseña" tono="info" /> : null}
            {u.bloqueado && u.bloqueado_hasta ? <Insignia texto={`Bloqueado hasta ${fechaHora(u.bloqueado_hasta)}`} tono="peligro" /> : null}
          </Fila>
        </Tarjeta>
      ))}
      <Tarjeta>
        <Text style={tipo.subtitulo}>Permisos por rol</Text>
        {(Object.keys(MATRIZ_ROLES) as (keyof typeof MATRIZ_ROLES)[]).map((r) => (
          <Text key={r} style={[tipo.nota, { marginTop: 6 }]}>
            <Text style={{ fontWeight: '700' }}>{NOMBRE_ROL[r]}:</Text> {[...MATRIZ_ROLES[r]].join(', ')}
          </Text>
        ))}
      </Tarjeta>
    </Pantalla>
  );
}
