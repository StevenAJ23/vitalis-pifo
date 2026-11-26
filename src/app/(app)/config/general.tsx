import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useAccion } from '../../../components/hooks';
import { Aviso, Boton, Campo, Interruptor, Pantalla, Seccion, Tarjeta, avisar, confirmar, notificar } from '../../../components/ui';
import { exigir } from '../../../security/permissions';
import { mensajeError } from '../../../services/contexto';
import { depurar } from '../../../services/rutaService';
import { cambiarAjuste, useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

export default function ConfigGeneral() {
  const { ajustes } = useApp();
  const actor = useActor();
  const db = useDb();
  const { ocupado, ejecutar } = useAccion();
  const [inact, setInact] = useState(ajustes.inactividad_min);
  const [retencion, setRetencion] = useState(ajustes.retencion_gps_dias);
  const [url, setUrl] = useState(ajustes.mapa_url);

  const guardar = (clave: Parameters<typeof cambiarAjuste>[0], valor: string, msg = 'Ajuste guardado.') =>
    ejecutar(async () => {
      try {
        exigir(actor.rol, 'seguridad.gestionar');
        await cambiarAjuste(clave, valor, actor.id);
        notificar(msg);
      } catch (e) {
        avisar('Error', mensajeError(e), 'error');
      }
    });

  const urlValida = /^https:\/\/[^\s]+\{z\}[^\s]*\{x\}[^\s]*\{y\}[^\s]*$/.test(url);
  const inactValida = /^\d+$/.test(inact) && +inact >= 1 && +inact <= 30;
  const retValida = /^\d+$/.test(retencion) && +retencion >= 1 && +retencion <= 3650;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Preferencias generales' }} />
      <Tarjeta>
        <Seccion titulo="Sesión y pantalla">
          <Campo etiqueta="Bloqueo por inactividad" value={inact} onChangeText={setInact} keyboardType="number-pad" unidad="min" error={inactValida ? undefined : '1–30 minutos'} ayuda="Recomendado ≤ 5 min en campo. Requisito para datos reales: ≤ 10 min." />
          <Boton titulo="Guardar tiempo de bloqueo" compacto variante="secundario" deshabilitado={!inactValida} onPress={() => guardar('inactividad_min', String(+inact))} />
          <Interruptor
            etiqueta="Impedir capturas de pantalla"
            descripcion="Evita que datos clínicos queden en capturas o en la vista de apps recientes."
            valor={ajustes.bloqueo_captura_pantalla === '1'}
            onCambio={(v) => guardar('bloqueo_captura_pantalla', v ? '1' : '0')}
          />
        </Seccion>
      </Tarjeta>
      <Tarjeta>
        <Seccion titulo="Datos opcionales del paciente">
          <Interruptor
            etiqueta="Capturar cédula, fecha de nacimiento y sexo"
            descripcion="Habilite solo si el consultorio justifica su captura (minimización de datos, LOPDP)."
            valor={ajustes.campos_opcionales === '1'}
            onCambio={(v) => guardar('campos_opcionales', v ? '1' : '0')}
          />
        </Seccion>
      </Tarjeta>
      <Tarjeta>
        <Seccion titulo="Mapa base en línea">
          <Interruptor
            etiqueta="Usar teselas de mapa cuando haya internet"
            descripcion="Al solicitar teselas, el proveedor conoce el área visualizada. Desactivado por defecto; sin internet se usa el trazado esquemático."
            valor={ajustes.mapa_teselas === '1'}
            onCambio={async (v) => {
              if (v && !(await confirmar('Autorizar mapa en línea', 'Se enviarán solicitudes al proveedor de teselas con el área del mapa (no se envían datos de pacientes). Respete su política de uso: no se descargan teselas masivamente.', { textoOk: 'Autorizar' }))) return;
              guardar('mapa_teselas', v ? '1' : '0');
            }}
          />
          <Campo etiqueta="Plantilla de URL (XYZ)" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} error={urlValida ? undefined : 'Debe ser https y contener {z}, {x} y {y}'} />
          <Boton titulo="Guardar URL" compacto variante="secundario" deshabilitado={!urlValida} onPress={() => guardar('mapa_url', url)} />
        </Seccion>
      </Tarjeta>
      <Tarjeta>
        <Seccion titulo="Conservación de recorridos GPS">
          <Campo etiqueta="Plazo de conservación acordado" value={retencion} onChangeText={setRetencion} keyboardType="number-pad" unidad="días" error={retValida ? undefined : '1–3650 días'} />
          <Boton titulo="Guardar plazo" compacto variante="secundario" deshabilitado={!retValida} onPress={() => guardar('retencion_gps_dias', String(+retencion))} />
          <Boton
            titulo="Depurar recorridos vencidos"
            variante="peligro"
            compacto
            estilo={{ marginTop: espacio.sm }}
            cargando={ocupado}
            onPress={() =>
              ejecutar(async () => {
                if (!(await confirmar('Depurar recorridos', `Se eliminarán definitivamente los recorridos finalizados hace más de ${ajustes.retencion_gps_dias} días.`, { destructivo: true, textoOk: 'Depurar' }))) return;
                try {
                  const n = await depurar(db, actor, Number(ajustes.retencion_gps_dias));
                  avisar('Depuración', `${n} recorrido(s) eliminados.`, 'exito');
                } catch (e) {
                  avisar('Error', mensajeError(e), 'error');
                }
              })
            }
          />
          <Text style={[tipo.nota, { marginTop: espacio.sm }]}>Exporte o respalde antes de depurar si el informe académico aún los necesita.</Text>
        </Seccion>
      </Tarjeta>
      <Aviso tono="info" texto="Todos los cambios de preferencias quedan registrados en la auditoría." />
    </Pantalla>
  );
}
