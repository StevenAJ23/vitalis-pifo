import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { BookOpen, ChevronRight, Database, Download, FileText, Flag, KeyRound, LogOut, Navigation, ScrollText, Settings, ShieldCheck, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccion } from '../../../components/hooks';
import { Boton, Insignia, Interruptor, Pantalla, Seccion, Tarjeta, avisar, confirmar } from '../../../components/ui';
import { buscarActualizacion } from '../../../services/actualizaciones';
import * as biometria from '../../../security/biometria';
import { activarBiometria, desactivarBiometria } from '../../../services/authService';
import { useEffect, useState } from 'react';
import { actualizacionStore, ofrecerDescarga } from '../../../state/actualizacion';
import { mensajeAccesoRapido, mensajeError } from '../../../services/contexto';
import { VERSION_ESQUEMA } from '../../../db/migrations';
import { auditar } from '../../../repositories/auditoria';
import { NOMBRE_ROL, puede, type Permiso } from '../../../security/permissions';
import { gpsStore } from '../../../services/gpsIngesta';
import { cambiarAjuste, cerrarSesionEnStore, useActor, useApp, useDb, usuarioBiometrico } from '../../../state/app';
import { colores, espacio, tipo } from '../../../theme';

function Opcion({ icono: Icono, titulo, detalle, ruta }: { icono: LucideIcon; titulo: string; detalle?: string; ruta: string }) {
  return (
    <Pressable onPress={() => router.push(ruta as never)} style={({ pressed }) => [estilos.opcion, pressed && { backgroundColor: colores.superficieAlt }]} accessibilityRole="button" accessibilityLabel={titulo}>
      <View style={estilos.opIcono}><Icono size={18} color={colores.primario} /></View>
      <View style={{ flex: 1 }}>
        <Text style={tipo.cuerpo}>{titulo}</Text>
        {detalle ? <Text style={tipo.nota}>{detalle}</Text> : null}
      </View>
      <ChevronRight size={18} color={colores.textoTenue} />
    </Pressable>
  );
}

export default function Ajustes() {
  const actor = useActor();
  const db = useDb();
  const app = useApp();
  const p = (x: Permiso) => puede(actor.rol, x);
  const { ocupado, ejecutar } = useAccion();
  const bio = usuarioBiometrico(app.ajustes);
  const [bioDisp, setBioDisp] = useState<biometria.DisponibilidadBiometria | null>(null);
  useEffect(() => {
    void biometria.disponibilidad().then(setBioDisp);
  }, []);

  const cambiarBiometria = (activar: boolean) =>
    ejecutar(async () => {
      try {
        if (bio) {
          // Un solo usuario por teléfono: se retira la configuración anterior.
          await biometria.eliminar(bio.id);
          await desactivarBiometria(db, bio.id);
          await cambiarAjuste('biometria_usuario', '', actor.id);
        }
        if (!activar) return;
        const token = await biometria.activar(actor.id);
        await activarBiometria(db, actor, token);
        await cambiarAjuste('biometria_usuario', JSON.stringify({ id: actor.id, nombre: actor.nombre }), actor.id);
        avisar('Acceso rápido activado', `La próxima vez podrá entrar con su ${bioDisp?.nombre ?? 'huella o PIN'}. Su contraseña sigue funcionando.`, 'exito');
      } catch (e) {
        avisar('Acceso rápido', mensajeAccesoRapido(e), 'error');
      }
    });

  const actualizar = () =>
    ejecutar(async () => {
      try {
        const r = await buscarActualizacion();
        if (!r.hayNueva) {
          avisar('Actualizaciones', `Ya tiene la última versión (${r.actual}).`);
          return;
        }
        actualizacionStore.set({ disponible: r, oculta: false });
        ofrecerDescarga(r);
      } catch (e) {
        avisar('Actualizaciones', mensajeError(e), 'error');
      }
    });

  const salir = async () => {
    const ruta = gpsStore.get().ruta;
    const msg = ruta
      ? 'Hay un recorrido GPS abierto: seguirá registrándose (o quedará en pausa) hasta que alguien lo finalice. ¿Cerrar sesión?'
      : '¿Desea cerrar la sesión?';
    if (!(await confirmar('Cerrar sesión', msg, { textoOk: 'Cerrar sesión' }))) return;
    await auditar(db, { usuarioId: actor.id, entidad: 'sesion', accion: 'LOGOUT' });
    cerrarSesionEnStore();
  };

  return (
    <Pantalla>
      {app.ajustes.modo_datos === 'SINTETICO' && p('seguridad.gestionar') ? (
        <Tarjeta style={{ borderColor: colores.aviso, backgroundColor: colores.avisoSuave }}>
          <Text style={[tipo.subtitulo, { color: colores.aviso }]}>La app está en modo de prueba</Text>
          <Text style={[tipo.secundario, { marginVertical: espacio.sm }]}>Cuando esté listo para la campaña, borre los datos de prueba y empiece a registrar pacientes reales.</Text>
          <Boton titulo="Pasar a datos reales" icono={ShieldCheck} onPress={() => router.push('/pasar-a-real')} />
        </Tarjeta>
      ) : null}
      <Tarjeta>
        <Text style={tipo.subtitulo}>{actor.nombre}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Insignia texto={NOMBRE_ROL[actor.rol]} tono="primario" />
          <Insignia texto={actor.codigo_operador} />
        </View>
      </Tarjeta>

      <Seccion titulo="Trabajo de campo">
        <Tarjeta style={{ padding: 0 }}>
          <Opcion icono={Flag} titulo="Campañas" detalle={app.campanaActiva ? `Activa: ${app.campanaActiva.nombre}` : 'Sin campaña activa'} ruta="/campanas" />
          {p('ruta.capturar') ? <Opcion icono={Navigation} titulo="Configuración GPS" detalle={`Cada ${Number(app.ajustes.gps_intervalo_ms) / 1000} s / ${app.ajustes.gps_distancia_m} m · precisión ≤ ${app.ajustes.gps_precision_max_m} m`} ruta="/config/gps" /> : null}
          <Opcion icono={KeyRound} titulo="Cambiar mi contraseña" ruta="/cuenta" />
          <View style={{ paddingHorizontal: espacio.lg }}>
            <Interruptor
              etiqueta={`Entrar con ${bioDisp?.nombre ?? 'huella o rostro'}`}
              descripcion={
                bioDisp && !bioDisp.disponible
                  ? bioDisp.motivo ?? undefined
                  : bio && bio.id !== actor.id
                    ? `Activado para ${bio.nombre}. Si lo activa, se reemplaza (uno por teléfono).`
                    : 'Use el sensor del teléfono para iniciar sesión y desbloquear. La contraseña sigue siendo válida.'
              }
              valor={bio?.id === actor.id}
              deshabilitado={ocupado || !bioDisp?.disponible}
              onCambio={(v) => void cambiarBiometria(v)}
            />
          </View>
        </Tarjeta>
      </Seccion>

      {p('usuarios.gestionar') || p('auditoria.ver') || p('seguridad.gestionar') || p('respaldo.gestionar') ? (
        <Seccion titulo="Administración y seguridad">
          <Tarjeta style={{ padding: 0 }}>
            {p('seguridad.gestionar') ? <Opcion icono={ShieldCheck} titulo="Seguridad y modo de datos" detalle={app.ajustes.modo_datos === 'REAL' ? 'Datos reales habilitados' : 'Modo de prueba (datos ficticios)'} ruta="/seguridad" /> : null}
            {p('respaldo.gestionar') ? <Opcion icono={Database} titulo="Respaldos cifrados" ruta="/respaldo" /> : null}
            {p('usuarios.gestionar') ? <Opcion icono={Users} titulo="Usuarios y roles" ruta="/usuarios" /> : null}
            {p('auditoria.ver') ? <Opcion icono={ScrollText} titulo="Auditoría" ruta="/auditoria" /> : null}
            {p('seguridad.gestionar') ? <Opcion icono={Settings} titulo="Preferencias generales" detalle={`Bloqueo tras ${app.ajustes.inactividad_min} min de inactividad`} ruta="/config/general" /> : null}
          </Tarjeta>
        </Seccion>
      ) : null}

      <Seccion titulo="Ayuda">
        <Tarjeta style={{ padding: 0 }}>
          <Opcion icono={BookOpen} titulo="Manual de usuario" detalle="Guía paso a paso para el equipo" ruta="/manual" />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Privacidad">
        <Tarjeta style={{ padding: 0 }}>
          <Opcion icono={FileText} titulo="Aviso de privacidad y tratamiento de datos" detalle={`Versión ${app.ajustes.aviso_version} · LOPDP Ecuador`} ruta="/privacidad" />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Actualizaciones">
        <Tarjeta>
          <Text style={tipo.secundario}>Versión instalada: {Constants.expoConfig?.version ?? '—'}</Text>
          <Interruptor
            etiqueta="Avisarme cuando haya una versión nueva"
            descripcion="Al abrir la app (máx. cada 30 min y solo con internet) consulta GitHub de forma anónima. Sus datos no se envían."
            valor={app.ajustes.actualizaciones_auto === '1'}
            onCambio={(v) => void cambiarAjuste('actualizaciones_auto', v ? '1' : '0', actor.id)}
          />
          <Boton titulo="Buscar actualización" icono={Download} variante="secundario" cargando={ocupado} onPress={actualizar} />
        </Tarjeta>
      </Seccion>

      <Boton titulo="Cerrar sesión" icono={LogOut} variante="secundario" onPress={salir} />
      <Text style={[tipo.nota, { textAlign: 'center', marginTop: espacio.lg }]}>
        Vitalis Pifo {Constants.expoConfig?.version ?? ''} · esquema v{VERSION_ESQUEMA} · dispositivo {app.ajustes.dispositivo_id.slice(0, 8)}
        {'\n'}
        {app.cifrado.sqlcipher ? `SQLCipher ${app.cifrado.version}` : 'Sin cifrado verificado'}
      </Text>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  opcion: { flexDirection: 'row', alignItems: 'center', gap: espacio.md, paddingHorizontal: espacio.lg, paddingVertical: espacio.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde, minHeight: 56 },
  opIcono: { width: 34, height: 34, borderRadius: 10, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
});
