import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useAccion, useCarga } from '../../../../components/hooks';
import { Aviso, Boton, Campo, Cargando, DatoFila, ErrorVista, Pantalla, Tarjeta, confirmar, notificar } from '../../../../components/ui';
import { formatearSegundos } from '../../../../domain/stats';
import { fechaHora } from '../../../../domain/time';
import * as evalRepo from '../../../../repositories/evaluacion';
import { mensajeError } from '../../../../services/contexto';
import { eliminarManual, fijarErroresVerificados } from '../../../../services/evaluacionService';
import { useActor, useDb } from '../../../../state/app';
import { espacio } from '../../../../theme';

/** Registro de errores comprobados contra la ficha fuente (separados de los errores de validación). */
export default function VerificarRegistro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const actor = useActor();
  const { ocupado, ejecutar } = useAccion();
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { datos, error: errCarga, recargar } = useCarga(async () => {
    const r = await evalRepo.porId(db, id);
    if (!r) throw new Error('Registro no encontrado');
    return r;
  }, [id]);

  if (errCarga) return <Pantalla><ErrorVista mensaje={errCarga} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;
  const v = valor ?? (datos.errores_verificados != null ? String(datos.errores_verificados) : '');

  return (
    <Pantalla>
      <Stack.Screen options={{ title: datos.codigo }} />
      <Tarjeta>
        <DatoFila etiqueta="Método" valor={datos.metodo} />
        <DatoFila etiqueta="Operador" valor={datos.operador} />
        <DatoFila etiqueta="Fecha" valor={fechaHora(datos.creado_at)} />
        <DatoFila etiqueta="Tiempo de ingreso" valor={formatearSegundos(datos.duracion_s)} />
        <DatoFila etiqueta="Tiempo de búsqueda" valor={formatearSegundos(datos.tiempo_busqueda_s)} />
        <DatoFila etiqueta="Errores de validación" valor={String(datos.errores_validacion)} />
        <DatoFila etiqueta="Campos faltantes" valor={String(datos.incompletos)} />
        <DatoFila etiqueta="Correcciones" valor={String(datos.correcciones)} />
        <DatoFila etiqueta="Guardado exitoso" valor={datos.guardado_exitoso ? 'Sí' : 'No'} />
      </Tarjeta>
      <Tarjeta>
        <Campo etiqueta="Errores verificados contra la ficha fuente" value={v} onChangeText={setValor} keyboardType="number-pad" maxLength={2} ayuda="Compare el registro con la ficha de papel firmada por el personal médico." />
        {error ? <Aviso tono="peligro" texto={error} /> : null}
        <Boton
          titulo="Guardar verificación"
          cargando={ocupado}
          deshabilitado={!/^\d+$/.test(v)}
          onPress={() =>
            ejecutar(async () => {
              try {
                await fijarErroresVerificados(db, actor, id, Number(v));
                notificar('Verificación guardada');
                router.back();
              } catch (e) {
                setError(mensajeError(e));
              }
            })
          }
        />
      </Tarjeta>
      {datos.metodo !== 'DIGITAL' ? (
        <Boton
          titulo="Retirar registro manual (error de captura)"
          icono={Trash2}
          variante="fantasma"
          estilo={{ marginTop: espacio.sm }}
          onPress={() =>
            ejecutar(async () => {
              if (!(await confirmar('Retirar registro', 'Solo para registros de papel/Excel ingresados por error.', { destructivo: true, textoOk: 'Retirar' }))) return;
              try {
                await eliminarManual(db, actor, id);
                router.back();
              } catch (e) {
                setError(mensajeError(e));
              }
            })
          }
        />
      ) : null}
    </Pantalla>
  );
}
