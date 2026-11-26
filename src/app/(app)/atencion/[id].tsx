import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Pencil } from 'lucide-react-native';
import { Text } from 'react-native';
import { Anulacion } from '../../../components/Anulacion';
import { useAccion, useCarga } from '../../../components/hooks';
import { Aviso, Boton, Cargando, DatoFila, ErrorVista, Fila, Insignia, Pantalla, Seccion, Tarjeta, avisar } from '../../../components/ui';
import { formatearImc } from '../../../domain/imc';
import { fechaHora } from '../../../domain/time';
import { detectarAtipicos } from '../../../domain/vitals';
import { puede } from '../../../security/permissions';
import * as atencionService from '../../../services/atencionService';
import { mensajeError } from '../../../services/contexto';
import { useActor, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

const TXT = { SI: 'Sí', NO: 'No', NO_EVALUADO: 'No evaluado' } as const;
const v = (n: number | null, u: string) => (n == null ? 'No registrado' : `${String(n).replace('.', ',')} ${u}`);

export default function DetalleAtencion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const { datos, error, recargar } = useCarga(async () => {
    const a = await atencionService.obtener(db, actor, id);
    const versiones = await atencionService.versiones(db, actor, id);
    return { a, versiones };
  }, [id]);

  if (error) return <Pantalla><ErrorVista mensaje={error} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const { a, versiones } = datos;
  const atip = detectarAtipicos(a, a.imc);

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Atención' }} />
      <Tarjeta onPress={puede(actor.rol, 'paciente.ver_ficha') ? () => router.push({ pathname: '/paciente/[id]', params: { id: a.paciente_id } }) : undefined}>
        <Text style={tipo.subtitulo}>{a.paciente_nombre}</Text>
        <Text style={tipo.secundario}>{a.paciente_codigo} · {a.paciente_sector}</Text>
        <Text style={tipo.nota}>{fechaHora(a.fecha)} · {a.campana_nombre} · registró {a.usuario_nombre ?? '—'}</Text>
        <Fila style={{ marginTop: 6 }}>
          {a.anulado_at ? <Insignia texto="ANULADA" tono="peligro" /> : null}
          {a.requiere_revision ? <Insignia texto={a.revisado_at ? 'Revisada' : 'Pendiente de revisión'} tono={a.revisado_at ? 'exito' : 'aviso'} /> : null}
          <Insignia texto={`Versión ${a.version}`} />
        </Fila>
      </Tarjeta>
      {a.anulado_at ? <Aviso tono="peligro" texto={`Anulada el ${fechaHora(a.anulado_at)}: ${a.motivo_anulacion ?? ''}`} /> : null}

      <Tarjeta>
        <Seccion titulo="Mediciones">
          <DatoFila etiqueta="Presión arterial" valor={a.sistolica != null ? `${a.sistolica}/${a.diastolica} mmHg` : 'No registrada'} />
          <DatoFila etiqueta="Frecuencia cardíaca" valor={v(a.frecuencia, 'lpm')} />
          <DatoFila etiqueta="Temperatura" valor={v(a.temperatura, '°C')} />
          <DatoFila etiqueta="Saturación O₂" valor={v(a.spo2, '%')} />
          <DatoFila etiqueta="Peso" valor={v(a.peso, 'kg')} />
          <DatoFila etiqueta="Talla" valor={v(a.talla_cm, 'cm')} />
          <DatoFila etiqueta="IMC" valor={a.imc == null ? 'No calculable' : `${formatearImc(a.imc)} kg/m²`} />
          <DatoFila etiqueta="Tapón oído izquierdo" valor={TXT[a.oido_i]} />
          <DatoFila etiqueta="Tapón oído derecho" valor={TXT[a.oido_d]} />
          <DatoFila etiqueta="Seguimiento" valor={a.seguimiento ? (a.cita_at ? `Sí · cita ${a.cita_at}` : 'Sí') : 'No'} />
          {a.observaciones ? <DatoFila etiqueta="Observaciones" valor={a.observaciones} /> : null}
        </Seccion>
      </Tarjeta>

      {atip.length > 0 ? (
        <Tarjeta>
          <Seccion titulo="Valores atípicos (no diagnósticos)">
            {atip.map((x, i) => <Text key={i} style={tipo.secundario}>• {x.mensaje}</Text>)}
          </Seccion>
          {a.requiere_revision && !a.revisado_at && !a.anulado_at && puede(actor.rol, 'atencion.revisar') ? (
            <Boton
              titulo="Marcar como revisada por personal médico"
              icono={CircleCheck}
              cargando={ocupado}
              onPress={() =>
                ejecutar(async () => {
                  try {
                    await atencionService.marcarRevisada(db, actor, a.id);
                    await recargar();
                  } catch (e) {
                    avisar('No se pudo marcar', mensajeError(e), 'error');
                  }
                })
              }
            />
          ) : null}
        </Tarjeta>
      ) : null}

      {!a.anulado_at && (puede(actor.rol, 'atencion.corregir') || (puede(actor.rol, 'atencion.corregir_propia') && a.usuario_id === actor.id)) ? (
        <Boton titulo="Corregir datos" icono={Pencil} variante="secundario" onPress={() => router.push({ pathname: '/atencion/editar/[id]', params: { id: a.id } })} estilo={{ marginBottom: espacio.md }} />
      ) : null}

      {versiones.length > 0 ? (
        <Seccion titulo="Versiones anteriores">
          <Tarjeta>
            {versiones.map((x) => (
              <DatoFila key={x.id} etiqueta={`v${x.version} · ${fechaHora(x.fecha)} · ${x.usuario_nombre ?? '—'}`} valor={x.motivo} />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}

      {!a.anulado_at && puede(actor.rol, 'atencion.anular') ? (
        <Anulacion
          titulo="Anular atención"
          onAnular={async (m) => {
            try {
              await atencionService.anular(db, actor, a.id, m);
              await recargar();
            } catch (e) {
              avisar('No se pudo anular', mensajeError(e), 'error');
            }
          }}
        />
      ) : null}
    </Pantalla>
  );
}
