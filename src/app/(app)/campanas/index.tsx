import { router, Stack } from 'expo-router';
import { CalendarDays, CircleCheck, Flag, MapPin, Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccion, useCarga } from '../../../components/hooks';
import { Aviso, Boton, Cargando, ErrorVista, Fila, Insignia, Interruptor, Pantalla, Tarjeta, Vacio, avisar } from '../../../components/ui';
import { fechaCorta } from '../../../domain/time';
import { puede } from '../../../security/permissions';
import * as campanaService from '../../../services/campanaService';
import { mensajeError } from '../../../services/contexto';
import { recargarAjustes, useActor, useApp, useDb } from '../../../state/app';
import { espacio, tipo } from '../../../theme';

const TONO = { ACTIVA: 'exito', PLANIFICADA: 'info', CERRADA: 'neutro', ARCHIVADA: 'neutro' } as const;

export default function Campanas() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const [archivadas, setArchivadas] = useState(false);
  const { ocupado, ejecutar } = useAccion();
  const { datos, error, recargar } = useCarga(async () => {
    const lista = await campanaService.listar(db, archivadas);
    const conteos = await Promise.all(lista.map((c) => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM atenciones WHERE campana_id = ? AND anulado_at IS NULL', [c.id])));
    return lista.map((c, i) => ({ ...c, atenciones: conteos[i]?.n ?? 0 }));
  }, [archivadas]);
  const gestionar = puede(actor.rol, 'campana.gestionar');

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Campañas' }} />
      {gestionar ? <Boton titulo="Nueva campaña" icono={Plus} onPress={() => router.push('/campanas/form')} estilo={{ marginBottom: espacio.md }} /> : null}
      <Interruptor etiqueta="Mostrar archivadas" valor={archivadas} onCambio={setArchivadas} />
      {error ? <ErrorVista mensaje={error} reintentar={recargar} /> : !datos ? <Cargando /> : datos.length === 0 ? (
        <Vacio icono={Flag} titulo="No hay campañas" mensaje={gestionar ? 'Cree la campaña de la jornada para empezar a registrar.' : 'Solicite al administrador que cree la campaña.'} />
      ) : (
        datos.map((c) => (
          <Tarjeta key={c.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacio.sm }}>
              <Text style={[tipo.subtitulo, { flex: 1 }]}>{c.nombre}</Text>
              <Insignia texto={c.estado} tono={TONO[c.estado]} />
            </View>
            <Fila style={{ marginVertical: 6 }}>
              <Insignia texto={c.sector} icono={MapPin} />
              <Insignia texto={`${fechaCorta(c.inicio)}${c.fin ? ' – ' + fechaCorta(c.fin) : ''}`} icono={CalendarDays} />
              <Insignia texto={`${c.atenciones} atenciones`} />
            </Fila>
            <Text style={tipo.nota}>Responsable: {c.responsable}</Text>
            {c.descripcion ? <Text style={[tipo.secundario, { marginTop: 4 }]}>{c.descripcion}</Text> : null}
            <Fila style={{ marginTop: espacio.sm }}>
              {campanaActiva?.id === c.id ? (
                <Insignia texto="Campaña de trabajo en este dispositivo" tono="primario" icono={CircleCheck} />
              ) : c.estado === 'ACTIVA' ? (
                <Boton
                  titulo="Trabajar en esta campaña"
                  compacto
                  cargando={ocupado}
                  onPress={() =>
                    ejecutar(async () => {
                      try {
                        await campanaService.seleccionarActiva(db, actor, c.id);
                        await recargarAjustes();
                        await recargar();
                      } catch (e) {
                        avisar('Campaña', mensajeError(e), 'error');
                      }
                    })
                  }
                />
              ) : null}
              {gestionar ? <Boton titulo="Editar" icono={Pencil} compacto variante="secundario" onPress={() => router.push({ pathname: '/campanas/form', params: { id: c.id } })} /> : null}
            </Fila>
          </Tarjeta>
        ))
      )}
      {!gestionar ? <Aviso tono="info" texto="Su rol puede elegir la campaña de trabajo, pero no crearlas ni editarlas." /> : null}
    </Pantalla>
  );
}
