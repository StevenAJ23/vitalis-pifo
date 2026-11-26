import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useCarga } from '../../components/hooks';
import { TarjetaAtencion } from '../../components/TarjetaAtencion';
import { Boton, Campo, Cargando, ErrorVista, Interruptor, Pantalla, Tarjeta, Vacio } from '../../components/ui';
import { esFechaValida, finDelDia, inicioDelDia } from '../../domain/time';
import { sectoresConocidos } from '../../repositories/pacientes';
import * as atencionService from '../../services/atencionService';
import * as campanaService from '../../services/campanaService';
import { useActor, useApp, useDb } from '../../state/app';
import { espacio, tipo } from '../../theme';

const PAGINA = 40;

/** Historial por fecha, campaña y sector (acceso solo para roles autorizados). */
export default function Historial() {
  const db = useDb();
  const actor = useActor();
  const { campanaActiva } = useApp();
  const [campana, setCampana] = useState<string>(campanaActiva?.id ?? '');
  const [sector, setSector] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const params = useLocalSearchParams<{ revision?: string }>();
  const [soloRevision, setSoloRevision] = useState(params.revision === '1');
  const [soloSeguimiento, setSoloSeguimiento] = useState(false);
  const [limite, setLimite] = useState(PAGINA);

  const opciones = useCarga(async () => ({ campanas: await campanaService.listar(db, true), sectores: await sectoresConocidos(db) }), []);
  const fechasOk = (desde === '' || esFechaValida(desde)) && (hasta === '' || esFechaValida(hasta));
  const { datos, error, cargando, recargar } = useCarga(
    () =>
      atencionService.historial(db, actor, {
        campanaId: campana || null,
        sector: sector || null,
        desdeMs: desde && esFechaValida(desde) ? inicioDelDia(desde) : null,
        hastaMs: hasta && esFechaValida(hasta) ? finDelDia(hasta) : null,
        soloRevision,
        soloSeguimiento,
        incluirAnuladas: true,
        limite,
      }),
    [campana, sector, desde, hasta, soloRevision, soloSeguimiento, limite],
  );

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Historial de atenciones' }} />
      <Tarjeta>
        <Text style={[tipo.etiqueta, { marginBottom: 6 }]}>Campaña</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espacio.md }}>
          {[{ id: '', nombre: 'Todas' }, ...(opciones.datos?.campanas ?? [])].map((c) => (
            <Boton key={c.id || 'todas'} titulo={c.nombre} compacto variante={c.id === campana ? 'primario' : 'secundario'} onPress={() => { setCampana(c.id); setLimite(PAGINA); }} />
          ))}
        </View>
        {(opciones.datos?.sectores.length ?? 0) > 0 ? (
          <>
            <Text style={[tipo.etiqueta, { marginBottom: 6 }]}>Sector</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espacio.md }}>
              {['', ...(opciones.datos?.sectores ?? [])].map((s) => (
                <Boton key={s || 'todos'} titulo={s || 'Todos'} compacto variante={s === sector ? 'primario' : 'secundario'} onPress={() => { setSector(s); setLimite(PAGINA); }} />
              ))}
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', gap: espacio.md }}>
          <View style={{ flex: 1 }}><Campo etiqueta="Desde" value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD" maxLength={10} error={desde && !esFechaValida(desde) ? 'Fecha inválida' : undefined} /></View>
          <View style={{ flex: 1 }}><Campo etiqueta="Hasta" value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD" maxLength={10} error={hasta && !esFechaValida(hasta) ? 'Fecha inválida' : undefined} /></View>
        </View>
        <Interruptor etiqueta="Solo pendientes de revisión médica" valor={soloRevision} onCambio={setSoloRevision} />
        <Interruptor etiqueta="Solo con seguimiento" valor={soloSeguimiento} onCambio={setSoloSeguimiento} />
      </Tarjeta>
      {!fechasOk ? null : error ? (
        <ErrorVista mensaje={error} reintentar={recargar} />
      ) : !datos ? (
        <Cargando />
      ) : datos.length === 0 ? (
        <Vacio titulo="Sin atenciones" mensaje="No hay registros con estos filtros." />
      ) : (
        <>
          <Text style={[tipo.nota, { marginBottom: espacio.sm }]}>{datos.length} resultado(s)</Text>
          {datos.map((a) => <TarjetaAtencion key={a.id} a={a} mostrarPaciente />)}
          {datos.length >= limite ? <Boton titulo="Cargar más" variante="secundario" cargando={cargando} onPress={() => setLimite((l) => l + PAGINA)} /> : null}
        </>
      )}
    </Pantalla>
  );
}
