import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Flag, Pencil, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BuscadorPacientes } from '../../../components/BuscadorPacientes';
import { FormularioAtencion } from '../../../components/FormularioAtencion';
import { conectividadActual, useAccion } from '../../../components/hooks';
import { Aviso, Boton, Cargando, Insignia, Pantalla, Tarjeta, Vacio } from '../../../components/ui';
import { formatearSegundos } from '../../../domain/stats';
import type { Paciente } from '../../../domain/types';
import { ATENCION_FORM_VACIO } from '../../../schemas/atencion';
import { puede } from '../../../security/permissions';
import * as atencionService from '../../../services/atencionService';
import { mensajeError } from '../../../services/contexto';
import * as pacienteService from '../../../services/pacienteService';
import { useActor, useApp, useDb } from '../../../state/app';
import { colores, espacio, tipo } from '../../../theme';

export default function NuevaAtencion() {
  const params = useLocalSearchParams<{ pacienteId?: string; t0?: string }>();
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [cargandoPac, setCargandoPac] = useState(!!params.pacienteId);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<atencionService.ResultadoRegistro | null>(null);
  const { ocupado, ejecutar } = useAccion();
  // Marcas de tiempo de la evaluación (se fijan en efectos/eventos, nunca durante el render).
  const inicioBusqueda = useRef<number>(0);
  const busquedaS = useRef<number | null>(null);
  const formMostrado = useRef<number>(0);
  const inicioIngreso = useRef<number | null>(null);
  const erroresValidacion = useRef(0);
  const [clave, setClave] = useState(0); // reinicia el formulario para una nueva atención

  useEffect(() => {
    const ahora = Date.now();
    inicioBusqueda.current = params.t0 ? Number(params.t0) || ahora : ahora;
    formMostrado.current = ahora;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!params.pacienteId) return;
    pacienteService
      .obtenerResumen(db, actor, params.pacienteId)
      .then((p) => {
        setPaciente(p);
        if (params.t0) busquedaS.current = (Date.now() - inicioBusqueda.current) / 1000;
        formMostrado.current = Date.now();
      })
      .catch((e) => setError(mensajeError(e)))
      .finally(() => setCargandoPac(false));
  }, [params.pacienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (p: Paciente) => {
    busquedaS.current = (Date.now() - inicioBusqueda.current) / 1000;
    formMostrado.current = Date.now();
    inicioIngreso.current = null;
    erroresValidacion.current = 0;
    setPaciente(p);
  };

  const otra = () => {
    setResultado(null);
    setPaciente(null);
    setError(null);
    inicioBusqueda.current = Date.now();
    busquedaS.current = null;
    setClave((k) => k + 1);
    router.setParams({ pacienteId: undefined, t0: undefined });
  };

  if (!campanaActiva) {
    return (
      <Pantalla>
        <Stack.Screen options={{ title: 'Nueva atención' }} />
        <Vacio icono={Flag} titulo="No hay campaña activa" mensaje="Seleccione o active una campaña para registrar atenciones." accion={<Boton titulo="Campañas" onPress={() => router.push('/campanas')} />} />
      </Pantalla>
    );
  }

  if (resultado && paciente) {
    return (
      <Pantalla>
        <Stack.Screen options={{ title: 'Atención guardada' }} />
        <Tarjeta style={{ alignItems: 'center', paddingVertical: espacio.xl }}>
          <CircleCheck size={56} color={colores.exito} />
          <Text style={[tipo.titulo, { marginTop: espacio.md }]}>Atención guardada</Text>
          <Text style={[tipo.secundario, { textAlign: 'center' }]}>
            {paciente.nombres} {paciente.apellidos} · {paciente.codigo}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: espacio.md, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Insignia texto={`Registro ${resultado.codigoEvaluacion}`} tono="primario" />
            <Insignia texto={`Tiempo de ingreso ${formatearSegundos(resultado.duracionS)}`} tono="info" />
          </View>
          <Text style={[tipo.nota, { marginTop: espacio.md, textAlign: 'center' }]}>Escritura confirmada en la base local cifrada.</Text>
        </Tarjeta>
        <Boton titulo="Nueva atención (otro paciente)" icono={Plus} grande onPress={otra} />
        <Boton
          titulo="Editar esta atención"
          icono={Pencil}
          variante="secundario"
          onPress={() => router.push({ pathname: '/atencion/editar/[id]', params: { id: resultado.atencionId } })}
          estilo={{ marginTop: espacio.sm }}
        />
        {puede(actor.rol, 'paciente.ver_ficha') ? (
          <Boton titulo="Ver ficha del paciente" variante="secundario" onPress={() => router.replace({ pathname: '/paciente/[id]', params: { id: paciente.id } })} estilo={{ marginTop: espacio.sm }} />
        ) : null}
        <Boton titulo="Volver al inicio" variante="fantasma" onPress={() => router.navigate('/')} estilo={{ marginTop: espacio.sm }} />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Stack.Screen options={{ title: paciente ? 'Mediciones' : 'Nueva atención · paciente' }} />
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      {cargandoPac ? (
        <Cargando />
      ) : !paciente ? (
        <>
          <Text style={[tipo.secundario, { marginBottom: espacio.sm }]}>1. Busque al paciente por código o datos autorizados. Si no existe, regístrelo.</Text>
          <BuscadorPacientes
            autoFoco
            onElegir={elegir}
            onCrear={puede(actor.rol, 'paciente.crear') ? () => router.push({ pathname: '/paciente/nuevo', params: { para: 'atencion', t0: String(inicioBusqueda.current) } }) : undefined}
          />
        </>
      ) : (
        <View key={clave}>
          <Tarjeta style={{ backgroundColor: colores.primarioSuave, borderColor: colores.primarioSuave }}>
            <Text style={tipo.subtitulo}>{paciente.nombres} {paciente.apellidos}</Text>
            <Text style={tipo.secundario}>{paciente.codigo} · {paciente.edad ?? 's/d'} años · {paciente.sector}</Text>
            <Text style={tipo.nota}>Campaña: {campanaActiva.nombre}</Text>
            {!params.pacienteId ? <Boton titulo="Cambiar paciente" variante="fantasma" compacto onPress={() => setPaciente(null)} estilo={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
          </Tarjeta>
          <FormularioAtencion
            inicial={ATENCION_FORM_VACIO}
            ocupado={ocupado}
            onPrimeraEdicion={() => {
              inicioIngreso.current = Date.now();
            }}
            onErrorValidacion={() => {
              erroresValidacion.current += 1;
            }}
            onGuardar={(form, atipicosConfirmados) =>
              ejecutar(async () => {
                setError(null);
                try {
                  const r = await atencionService.registrar(db, actor, {
                    pacienteId: paciente.id,
                    campanaId: campanaActiva.id,
                    form,
                    atipicosConfirmados,
                    medicion: {
                      inicioMs: inicioIngreso.current ?? formMostrado.current,
                      busquedaS: busquedaS.current,
                      erroresValidacion: erroresValidacion.current,
                      conectividad: await conectividadActual(),
                    },
                  });
                  setResultado(r); // solo tras escritura exitosa
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                } catch (e) {
                  setError(mensajeError(e));
                }
              })
            }
          />
        </View>
      )}
    </Pantalla>
  );
}
