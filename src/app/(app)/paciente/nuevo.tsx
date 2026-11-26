import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { FormularioPaciente } from '../../../components/FormularioPaciente';
import { useAccion } from '../../../components/hooks';
import { Aviso, Boton, Insignia, Pantalla, Tarjeta, notificar } from '../../../components/ui';
import type { Paciente } from '../../../domain/types';
import { PACIENTE_FORM_VACIO, type PacienteForm } from '../../../schemas/paciente';
import { puede } from '../../../security/permissions';
import { mensajeError } from '../../../services/contexto';
import * as pacienteService from '../../../services/pacienteService';
import { useActor, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

export default function NuevoPaciente() {
  const db = useDb();
  const actor = useActor();
  const { para, t0 } = useLocalSearchParams<{ para?: string; t0?: string }>();
  const { ocupado, ejecutar } = useAccion();
  const [pendiente, setPendiente] = useState<PacienteForm | null>(null);
  const [duplicados, setDuplicados] = useState<pacienteService.CandidatoDuplicado[]>([]);
  const [error, setError] = useState<string | null>(null);

  const continuar = (p: Paciente) => {
    if (para === 'atencion') {
      router.replace({ pathname: '/atencion/nueva', params: { pacienteId: p.id, t0: t0 ?? '' } });
    } else if (puede(actor.rol, 'paciente.ver_ficha')) {
      router.replace({ pathname: '/paciente/[id]', params: { id: p.id } });
    } else {
      router.replace({ pathname: '/atencion/nueva', params: { pacienteId: p.id } });
    }
  };

  const crear = (v: PacienteForm) =>
    ejecutar(async () => {
      try {
        const p = await pacienteService.crear(db, actor, v);
        notificar(`Paciente registrado · ${p.codigo}`);
        continuar(p);
      } catch (e) {
        setError(mensajeError(e));
      }
    });

  const validar = (v: PacienteForm) =>
    ejecutar(async () => {
      setError(null);
      try {
        const d = await pacienteService.posiblesDuplicados(db, actor, v);
        if (d.length > 0) {
          setPendiente(v);
          setDuplicados(d);
          return;
        }
      } catch (e) {
        setError(mensajeError(e));
        return;
      }
      await crearSinBloqueo(v);
    });

  // crear() usa el mismo bloqueo de doble pulsación; desde validar() se llama directamente.
  const crearSinBloqueo = async (v: PacienteForm) => {
    try {
      const p = await pacienteService.crear(db, actor, v);
      notificar(`Paciente registrado · ${p.codigo}`);
      continuar(p);
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Nuevo paciente' }} />
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      {pendiente ? (
        <View>
          <Aviso texto="Posibles duplicados encontrados. Verifique antes de crear un registro nuevo (no se fusionan automáticamente)." />
          {duplicados.map(({ paciente: p, motivos }) => (
            <Tarjeta key={p.id}>
              <Text style={tipo.subtitulo}>{p.apellidos}, {p.nombres}</Text>
              <Text style={tipo.secundario}>{p.codigo} · {p.edad ?? 's/d'} años · {p.sector}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: espacio.sm }}>
                {motivos.map((m) => <Insignia key={m} texto={m} tono="aviso" />)}
              </View>
              <Boton titulo="Es este paciente: usarlo" variante="secundario" onPress={() => continuar(p)} />
            </Tarjeta>
          ))}
          <Boton titulo="Es otra persona: crear registro nuevo" onPress={() => crear(pendiente)} cargando={ocupado} />
          <Boton titulo="Volver al formulario" variante="fantasma" onPress={() => setPendiente(null)} estilo={{ marginTop: espacio.sm }} />
        </View>
      ) : (
        <FormularioPaciente inicial={PACIENTE_FORM_VACIO} textoGuardar="Guardar paciente" onGuardar={validar} ocupado={ocupado} />
      )}
    </Pantalla>
  );
}
