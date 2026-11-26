import { router, Stack } from 'expo-router';
import { Check, CircleCheck, CircleX, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAccion, useCarga } from '../../components/hooks';
import { Aviso, Boton, Campo, Cargando, DatoFila, ErrorVista, Pantalla, Seccion, Tarjeta, confirmar, notificar } from '../../components/ui';
import { eliminarArchivo, listarRespaldosLocales } from '../../platform/files';
import { validarFraseRespaldo } from '../../security/backupCrypto';
import { exigir } from '../../security/permissions';
import * as backup from '../../services/backupService';
import { mensajeError } from '../../services/contexto';
import { gpsStore } from '../../services/gpsIngesta';
import * as seguridad from '../../services/seguridadService';
import { recargarAjustes, useActor, useApp, useDb } from '../../state/app';
import { colores, espacio, tipo } from '../../theme';

/**
 * Asistente para dejar el modo de prueba: 1) controles de seguridad, 2) prueba de respaldo cifrado,
 * 3) autorización del consultorio, 4) borrar datos de prueba y activar datos reales (una transacción).
 */
export default function PasarAReal() {
  const db = useDb();
  const actor = useActor();
  const app = useApp();
  const { ocupado, ejecutar } = useAccion();
  const [frase, setFrase] = useState('');
  const [frase2, setFrase2] = useState('');
  const [responsable, setResponsable] = useState('');
  const [referencia, setReferencia] = useState('');
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entorno = { sqlcipher: app.cifrado.sqlcipher, cipherVersion: app.cifrado.version, claveEnAlmacenSeguro: app.claveSegura };

  const { datos, error: errCarga, recargar } = useCarga(async () => {
    exigir(actor.rol, 'seguridad.gestionar');
    const [ch, resumen] = await Promise.all([seguridad.chequeos(db, entorno), seguridad.resumenDatos(db)]);
    return { ch, resumen };
  }, [app.ajustes.respaldo_verificado_at, app.cifrado.sqlcipher]);

  if (app.ajustes.modo_datos === 'REAL') {
    return (
      <Pantalla>
        <Stack.Screen options={{ title: 'Datos reales' }} />
        <Aviso tono="exito" icono={CircleCheck} texto="La app ya está en modo de datos reales." />
      </Pantalla>
    );
  }
  if (errCarga) return <Pantalla><ErrorVista mensaje={errCarga} reintentar={recargar} /></Pantalla>;
  if (!datos) return <Pantalla><Cargando /></Pantalla>;

  const controles = datos.ch.filter((c) => c.id !== 'respaldo');
  const controlesOk = controles.every((c) => c.ok);
  const respaldoOk = datos.ch.find((c) => c.id === 'respaldo')?.ok ?? false;
  const errFrase = frase ? validarFraseRespaldo(frase) : null;
  const listo = controlesOk && respaldoOk && responsable.trim().length >= 3 && referencia.trim().length >= 3 && acepto;

  const probarRespaldo = () =>
    ejecutar(async () => {
      setError(null);
      try {
        const { sobre } = await backup.crearRespaldo(db, actor, frase);
        await backup.verificarRespaldo(db, actor, JSON.stringify(sobre), frase); // cifra, descifra y valida
        await recargarAjustes();
        setFrase('');
        setFrase2('');
        notificar('Respaldo cifrado probado correctamente');
      } catch (e) {
        setError(mensajeError(e));
      }
    });

  const pasar = () =>
    ejecutar(async () => {
      setError(null);
      const r = datos.resumen;
      const ok = await confirmar(
        'Borrar datos de prueba',
        `Se eliminarán definitivamente ${r.pacientes} pacientes, ${r.atenciones} atenciones, ${r.campanas} campañas, ${r.rutas} recorridos y ${r.evaluaciones} registros de evaluación de prueba. Los usuarios se conservan. Luego la app quedará lista para datos reales.`,
        { textoOk: 'Borrar y continuar', destructivo: true },
      );
      if (!ok) return;
      try {
        await seguridad.pasarADatosReales(db, actor, entorno, { responsable, referencia });
        for (const f of listarRespaldosLocales()) eliminarArchivo(f.uri); // respaldos de datos ficticios
        gpsStore.set({ ruta: null, aceptados: 0, rechazados: {}, ultimaLectura: null, ultimaAceptadaMs: null });
        await recargarAjustes();
        notificar('Listo: modo de datos reales activado');
        router.replace('/campanas/form');
      } catch (e) {
        setError(mensajeError(e));
      }
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Pasar a datos reales' }} />
      <Text style={[tipo.secundario, { marginBottom: espacio.md }]}>
        Complete los pasos. Al final se borran los datos de prueba y la app queda lista para registrar pacientes reales. Los usuarios y contraseñas se mantienen.
      </Text>

      <Seccion titulo="1. Seguridad del teléfono">
        <Tarjeta>
          {controles.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, alignItems: 'flex-start' }}>
              {c.ok ? <CircleCheck size={20} color={colores.exito} /> : <CircleX size={20} color={colores.peligro} />}
              <View style={{ flex: 1 }}>
                <Text style={tipo.cuerpo}>{c.titulo}</Text>
                {!c.ok ? <Text style={tipo.nota}>{c.detalle}</Text> : null}
              </View>
            </View>
          ))}
          {!controlesOk ? <Aviso tono="peligro" texto="Hay controles sin cumplir. Revise Ajustes › Seguridad o Preferencias generales." /> : null}
        </Tarjeta>
      </Seccion>

      <Seccion titulo="2. Probar el respaldo cifrado">
        <Tarjeta>
          {respaldoOk ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <CircleCheck size={20} color={colores.exito} />
              <Text style={tipo.cuerpo}>Respaldo cifrado y restauración verificados</Text>
            </View>
          ) : (
            <>
              <Text style={[tipo.nota, { marginBottom: espacio.sm }]}>
                Elija la clave con la que hará los respaldos reales (12+ caracteres con letras y números) y guárdela en un lugar seguro. Se probará cifrar y descifrar.
              </Text>
              <Campo etiqueta="Clave de respaldo" value={frase} onChangeText={setFrase} secureTextEntry autoCapitalize="none" error={errFrase ?? undefined} />
              <Campo etiqueta="Repetir clave" value={frase2} onChangeText={setFrase2} secureTextEntry autoCapitalize="none" error={frase2 && frase2 !== frase ? 'No coincide' : undefined} />
              <Boton titulo="Probar respaldo" icono={ShieldCheck} variante="secundario" onPress={probarRespaldo} cargando={ocupado} deshabilitado={!frase || !!errFrase || frase !== frase2} />
            </>
          )}
        </Tarjeta>
      </Seccion>

      <Seccion titulo="3. Autorización del consultorio">
        <Tarjeta>
          <Campo etiqueta="Responsable que autoriza" value={responsable} onChangeText={setResponsable} placeholder="Dr./Dra. …" />
          <Campo etiqueta="Referencia de la autorización" value={referencia} onChangeText={setReferencia} placeholder="Oficio, acta o fecha" />
          <Pressable onPress={() => setAcepto((v) => !v)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }} accessibilityRole="checkbox" accessibilityState={{ checked: acepto }}>
            <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colores.primario, backgroundColor: acepto ? colores.primario : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {acepto ? <Check size={16} color="#fff" /> : null}
            </View>
            <Text style={[tipo.cuerpo, { flex: 1 }]}>Existe autorización, base jurídica y aviso de privacidad, y el equipo fue capacitado.</Text>
          </Pressable>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="4. Borrar datos de prueba">
        <Tarjeta>
          <DatoFila etiqueta="Pacientes de prueba" valor={String(datos.resumen.pacientes)} />
          <DatoFila etiqueta="Atenciones" valor={String(datos.resumen.atenciones)} />
          <DatoFila etiqueta="Campañas" valor={String(datos.resumen.campanas)} />
          <DatoFila etiqueta="Recorridos GPS" valor={String(datos.resumen.rutas)} />
          <DatoFila etiqueta="Registros de evaluación" valor={String(datos.resumen.evaluaciones)} />
        </Tarjeta>
        {error ? <Aviso tono="peligro" texto={error} /> : null}
        <Boton titulo="Borrar datos de prueba y pasar a reales" icono={Trash2} variante="peligro" grande onPress={pasar} cargando={ocupado} deshabilitado={!listo} />
        {!listo ? <Text style={[tipo.nota, { marginTop: espacio.sm, textAlign: 'center' }]}>Complete los pasos 1 a 3 para habilitar el botón.</Text> : null}
      </Seccion>
    </Pantalla>
  );
}
