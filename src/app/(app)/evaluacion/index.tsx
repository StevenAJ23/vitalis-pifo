import { router, Stack } from 'expo-router';
import { ClipboardList, Smile, Timer } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCarga } from '../../../components/hooks';
import { Aviso, Boton, Cargando, ErrorVista, Fila, Insignia, Pantalla, Segmentado, Tarjeta, Vacio } from '../../../components/ui';
import { formatearSegundos } from '../../../domain/stats';
import { fechaHora } from '../../../domain/time';
import type { Metodo } from '../../../domain/types';
import * as evaluacion from '../../../services/evaluacionService';
import { useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

export default function Evaluacion() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const [metodo, setMetodo] = useState<'' | Metodo>('');
  const { datos, error, recargar } = useCarga(() => evaluacion.resumen(db, actor, campanaActiva?.id ?? null), [campanaActiva?.id]);

  const filas = (datos?.filas ?? []).filter((f) => !metodo || f.metodo === metodo);
  const pendientes = (datos?.filas ?? []).filter((f) => f.errores_verificados == null && f.guardado_exitoso === 1).length;

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Evaluación del piloto' }} />
      {!campanaActiva ? <Aviso texto="Active una campaña: los registros de evaluación se asocian a la campaña de trabajo." /> : null}
      <Text style={[tipo.secundario, { marginBottom: espacio.md }]}>
        Diseño comparativo: dos integrantes con papel/Excel y dos con la app; mismos campos y criterios. Se mide desde el inicio del ingreso hasta el guardado, sin
        incluir la medición clínica. Las filas digitales se generan automáticamente al guardar cada atención.
      </Text>
      <Fila style={{ marginBottom: espacio.md }}>
        <Boton titulo="Registro papel/Excel" icono={Timer} onPress={() => router.push('/evaluacion/manual')} deshabilitado={!campanaActiva} estilo={{ flex: 1 }} />
        <Boton titulo="Encuesta" icono={Smile} variante="secundario" onPress={() => router.push('/evaluacion/sesion')} deshabilitado={!campanaActiva} estilo={{ flex: 1 }} />
      </Fila>
      {pendientes > 0 ? <Aviso tono="info" texto={`${pendientes} registro(s) sin verificar contra la ficha fuente. Tóquelos para registrar los errores verificados.`} /> : null}
      <Segmentado valor={metodo} onCambio={setMetodo} opciones={[{ valor: '', texto: 'Todos' }, { valor: 'DIGITAL', texto: 'Digital' }, { valor: 'PAPEL', texto: 'Papel' }, { valor: 'EXCEL', texto: 'Excel' }]} />
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : filas.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="Sin registros" mensaje="Registre atenciones en la app o tiempos de papel/Excel." />
      ) : (
        filas.map((f) => (
          <Tarjeta key={f.id} onPress={() => router.push({ pathname: '/evaluacion/verificar/[id]', params: { id: f.id } })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={tipo.subtitulo}>{f.codigo}</Text>
              <Text style={tipo.subtitulo}>{formatearSegundos(f.duracion_s)}</Text>
            </View>
            <Text style={tipo.nota}>{fechaHora(f.creado_at)} · operador {f.operador}</Text>
            <Fila style={{ marginTop: 6 }}>
              <Insignia texto={f.metodo} tono={f.metodo === 'DIGITAL' ? 'primario' : 'neutro'} />
              {f.guardado_exitoso ? null : <Insignia texto="No guardado" tono="peligro" />}
              <Insignia texto={`Faltantes ${f.incompletos}`} />
              {f.errores_validacion ? <Insignia texto={`Validación ${f.errores_validacion}`} tono="aviso" /> : null}
              <Insignia texto={f.errores_verificados == null ? 'Sin verificar' : `Verificados ${f.errores_verificados}`} tono={f.errores_verificados == null ? 'info' : 'exito'} />
              {f.correcciones ? <Insignia texto={`Correcciones ${f.correcciones}`} /> : null}
              <Insignia texto={f.conectividad === 'SIN_CONEXION' ? 'Sin conexión' : f.conectividad === 'EN_LINEA' ? 'En línea' : 'Conexión s/d'} />
            </Fila>
          </Tarjeta>
        ))
      )}
    </Pantalla>
  );
}
