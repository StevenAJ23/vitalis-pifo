import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pencil, Stethoscope } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { Anulacion } from '../../../components/Anulacion';
import { useCarga } from '../../../components/hooks';
import { TarjetaAtencion } from '../../../components/TarjetaAtencion';
import { Aviso, Avatar, Boton, Cargando, DatoFila, ErrorVista, Fila, Insignia, Pantalla, Seccion, Tarjeta, Vacio } from '../../../components/ui';
import { EvolucionVitales } from '../../../components/EvolucionVitales';
import { enmascararTelefono } from '../../../domain/text';
import { fechaCorta, fechaHora } from '../../../domain/time';
import { consentimientosDe } from '../../../repositories/pacientes';
import { puede } from '../../../security/permissions';
import * as atencionService from '../../../services/atencionService';
import * as pacienteService from '../../../services/pacienteService';
import { useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

const CANAL: Record<string, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', NINGUNO: 'Ninguno' };

export default function FichaPaciente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const { datos, error, recargar } = useCarga(async () => {
    const p = await pacienteService.obtenerFicha(db, actor, id);
    const [hist, cons] = await Promise.all([atencionService.dePaciente(db, actor, id), consentimientosDe(db, id)]);
    return { p, hist, cons };
  }, [id]);

  if (error) return <Pantalla><ErrorVista mensaje={error} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const { p, hist, cons } = datos;
  const opc = p.campos_opcionales;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: p.codigo }} />
      <Tarjeta>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md }}>
          <Avatar nombres={p.nombres} apellidos={p.apellidos} tamano={56} />
          <View style={{ flex: 1 }}>
            <Text style={tipo.titulo}>{p.nombres} {p.apellidos}</Text>
            <Text style={tipo.secundario}>{p.edad != null ? `${p.edad} años` : 'Edad s/d'} · {p.sector} · {hist.filter((a) => !a.anulado_at).length} atención(es)</Text>
          </View>
        </View>
        <Fila style={{ marginTop: 6 }}>
          <Insignia texto={p.codigo} tono="primario" />
          {p.anulado_at ? <Insignia texto="ANULADO" tono="peligro" /> : null}
          {p.consentimiento_contacto ? <Insignia texto={`Contacto: ${CANAL[p.canal_preferido]}`} tono="info" /> : <Insignia texto="Sin consentimiento de contacto" />}
        </Fila>
        <View style={{ marginTop: espacio.md }}>
          <DatoFila etiqueta="Edad" valor={p.edad != null ? `${p.edad} años` : '—'} />
          <DatoFila etiqueta="Sector / comunidad" valor={p.sector} />
          <DatoFila etiqueta="Celular" valor={enmascararTelefono(p.telefono)} />
          {opc.cedula ? <DatoFila etiqueta="Cédula" valor={`${opc.cedula.slice(0, 2)}••••••${opc.cedula.slice(-2)}`} /> : null}
          {opc.fecha_nacimiento ? <DatoFila etiqueta="Nacimiento" valor={fechaCorta(opc.fecha_nacimiento)} /> : null}
          {opc.sexo ? <DatoFila etiqueta="Sexo" valor={opc.sexo} /> : null}
          <DatoFila etiqueta="Registrado" valor={fechaHora(p.creado_at)} />
        </View>
      </Tarjeta>

      {!p.anulado_at ? (
        <Fila style={{ marginBottom: espacio.lg }}>
          {puede(actor.rol, 'atencion.crear') && campanaActiva ? (
            <Boton titulo="Nueva atención" icono={Stethoscope} onPress={() => router.push({ pathname: '/atencion/nueva', params: { pacienteId: p.id } })} estilo={{ flex: 1 }} />
          ) : null}
          {puede(actor.rol, 'paciente.editar') ? (
            <Boton titulo="Editar" icono={Pencil} variante="secundario" onPress={() => router.push({ pathname: '/paciente/editar/[id]', params: { id: p.id } })} estilo={{ flex: 1 }} />
          ) : null}
        </Fila>
      ) : null}
      {!campanaActiva && !p.anulado_at ? <Aviso texto="Active una campaña para registrar atenciones." /> : null}

      <EvolucionVitales hist={hist} />

      <Seccion titulo={`Historial de atenciones (${hist.length})`}>
        {hist.length === 0 ? <Vacio titulo="Sin atenciones registradas" /> : hist.map((a) => <TarjetaAtencion key={a.id} a={a} />)}
      </Seccion>

      <Seccion titulo="Consentimientos">
        {cons.length === 0 ? (
          <Text style={tipo.nota}>No hay registros de consentimiento de contacto.</Text>
        ) : (
          <Tarjeta>
            {cons.map((c) => (
              <DatoFila key={c.id} etiqueta={`${fechaHora(c.fecha)} · aviso v${c.version_aviso}`} valor={`${c.estado === 'OTORGADO' ? 'Otorgado' : 'Revocado'} (${CANAL[c.canal] ?? c.canal})`} />
            ))}
          </Tarjeta>
        )}
      </Seccion>

      {puede(actor.rol, 'paciente.anular') && !p.anulado_at ? (
        <Anulacion
          titulo="Anular paciente"
          onAnular={async (m) => {
            await pacienteService.anular(db, actor, p.id, m);
            await recargar();
          }}
        />
      ) : null}
    </Pantalla>
  );
}
