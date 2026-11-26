import { Stack } from 'expo-router';
import { CircleCheck, CircleX, FlaskConical } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccion, useCarga } from '../../components/hooks';
import { Aviso, Boton, Campo, Cargando, DatoFila, ErrorVista, Pantalla, Seccion, Tarjeta, avisar, confirmar } from '../../components/ui';
import { fechaHora } from '../../domain/time';
import { exigir } from '../../security/permissions';
import { mensajeError } from '../../services/contexto';
import * as seguridad from '../../services/seguridadService';
import { generar } from '../../services/sinteticoService';
import { pendientes } from '../../sync/syncService';
import { recargarAjustes, useActor, useApp, useDb } from '../../state/app';
import { colores, espacio, tipo } from '../../theme';

export default function Seguridad() {
  const db = useDb();
  const actor = useActor();
  const app = useApp();
  const { ocupado, ejecutar } = useAccion();
  const [responsable, setResponsable] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cantidad, setCantidad] = useState('10');
  const [textoPurga, setTextoPurga] = useState('');
  const entorno = { sqlcipher: app.cifrado.sqlcipher, cipherVersion: app.cifrado.version, claveEnAlmacenSeguro: app.claveSegura };

  const { datos, error, recargar } = useCarga(async () => {
    exigir(actor.rol, 'seguridad.gestionar');
    const [ch, pac, sync] = await Promise.all([seguridad.chequeos(db, entorno), seguridad.contarPacientes(db), pendientes(db)]);
    return { ch, pac, sync };
  }, [app.cifrado.sqlcipher, app.claveSegura, app.ajustes.respaldo_verificado_at, app.ajustes.inactividad_min]);

  const modoReal = app.ajustes.modo_datos === 'REAL';
  let autorizacion: { responsable?: string; referencia?: string; fecha?: number } | null = null;
  try {
    autorizacion = app.ajustes.autorizacion_real ? JSON.parse(app.ajustes.autorizacion_real) : null;
  } catch {
    autorizacion = null;
  }

  const op = (fn: () => Promise<void>) =>
    ejecutar(async () => {
      try {
        await fn();
        await recargarAjustes();
        await recargar();
      } catch (e) {
        avisar('Seguridad', mensajeError(e), 'error');
      }
    });

  if (error) return <Pantalla><ErrorVista mensaje={error} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const todosOk = datos.ch.every((c) => c.ok);

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Seguridad y modo de datos' }} />
      <Seccion titulo="Controles verificados">
        <Tarjeta>
          {datos.ch.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' }}>
              {c.ok ? <CircleCheck size={20} color={colores.exito} /> : <CircleX size={20} color={colores.peligro} />}
              <View style={{ flex: 1 }}>
                <Text style={tipo.cuerpo}>{c.titulo}</Text>
                <Text style={tipo.nota}>{c.detalle}</Text>
              </View>
            </View>
          ))}
          <Boton titulo="Volver a verificar" variante="secundario" compacto onPress={() => void recargar()} />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Modo de datos">
        <Tarjeta>
          <DatoFila etiqueta="Modo actual" valor={modoReal ? 'DATOS REALES' : 'PRUEBA (solo ficticios)'} tono={modoReal ? undefined : 'aviso'} />
          {autorizacion ? <DatoFila etiqueta="Autorización" valor={`${autorizacion.responsable} · ${autorizacion.referencia} · ${fechaHora(autorizacion.fecha)}`} /> : null}
          {!modoReal ? (
            <>
              <Text style={[tipo.secundario, { marginVertical: espacio.sm }]}>
                Para tratar datos reales se requiere: todos los controles en verde, autorización del consultorio, base jurídica y aviso de privacidad aplicables, y la base sin datos de prueba.
              </Text>
              <Campo etiqueta="Responsable que autoriza (consultorio)" value={responsable} onChangeText={setResponsable} />
              <Campo etiqueta="Referencia del documento de autorización" value={referencia} onChangeText={setReferencia} placeholder="Oficio / acta / fecha" />
              {!todosOk ? <Aviso tono="peligro" texto="Hay controles sin cumplir: no se puede habilitar el modo de datos reales." /> : null}
              {datos.pac > 0 ? <Aviso texto={`La base contiene ${datos.pac} paciente(s) de prueba. Púrguelos antes de habilitar datos reales.`} /> : null}
              <Boton
                titulo="Habilitar datos reales"
                variante="peligro"
                deshabilitado={!todosOk || datos.pac > 0 || responsable.trim().length < 3 || referencia.trim().length < 3}
                cargando={ocupado}
                onPress={() =>
                  op(async () => {
                    if (!(await confirmar('Habilitar datos reales', 'Confirmo que existe autorización del consultorio, base jurídica y aviso de privacidad, y que el personal fue capacitado.', { textoOk: 'Habilitar', destructivo: true }))) return;
                    await seguridad.cambiarModo(db, actor, 'REAL', entorno, { responsable, referencia });
                  })
                }
              />
            </>
          ) : (
            <Text style={[tipo.nota, { marginTop: espacio.sm }]}>En modo real no se permiten datos sintéticos ni purgas masivas.</Text>
          )}
        </Tarjeta>
      </Seccion>

      {!modoReal ? (
        <Seccion titulo="Datos de prueba">
          <Tarjeta>
            <Text style={[tipo.secundario, { marginBottom: espacio.sm }]}>
              Genera pacientes, atenciones, evaluaciones y un recorrido marcados como ficticios usando los mismos servicios de la app. Requiere campaña activa.
            </Text>
            <Campo etiqueta="Cantidad de pacientes ficticios" value={cantidad} onChangeText={setCantidad} keyboardType="number-pad" maxLength={3} />
            <Boton
              titulo="Generar datos sintéticos"
              icono={FlaskConical}
              variante="secundario"
              deshabilitado={!app.campanaActiva || !/^\d+$/.test(cantidad) || +cantidad < 1 || +cantidad > 200}
              cargando={ocupado}
              onPress={() =>
                op(async () => {
                  const r = await generar(db, actor, app.campanaActiva!.id, Number(cantidad));
                  avisar('Datos sintéticos', `${r.pacientes} pacientes con atención${r.rutaId ? ' y 1 recorrido sintético' : ''}.`, 'exito');
                })
              }
            />
            <View style={{ height: espacio.lg }} />
            <Campo etiqueta='Para purgar TODOS los datos de prueba escriba "PURGAR"' value={textoPurga} onChangeText={setTextoPurga} autoCapitalize="characters" />
            <Boton
              titulo="Purgar datos de prueba"
              variante="peligro"
              deshabilitado={textoPurga !== 'PURGAR'}
              cargando={ocupado}
              onPress={() =>
                op(async () => {
                  if (!(await confirmar('Purgar datos', 'Se eliminarán pacientes, atenciones, campañas, evaluaciones y recorridos de este dispositivo. Los usuarios se conservan.', { destructivo: true, textoOk: 'Purgar' }))) return;
                  await seguridad.purgarDatosPrueba(db, actor, 'SINTETICO');
                  setTextoPurga('');
                })
              }
            />
          </Tarjeta>
        </Seccion>
      ) : null}

      <Seccion titulo="Consolidación futura (API REST)">
        <Tarjeta>
          <Text style={[tipo.secundario, { marginBottom: espacio.sm }]}>
            El piloto funciona sin servidor. Registros pendientes de sincronizar cuando exista la API central (no hay envíos automáticos):
          </Text>
          {Object.entries(datos.sync).map(([t, n]) => <DatoFila key={t} etiqueta={t} valor={String(n)} />)}
        </Tarjeta>
      </Seccion>
    </Pantalla>
  );
}
