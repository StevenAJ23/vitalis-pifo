import { Stack } from 'expo-router';
import { Database, FolderOpen, Share2, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAccion, useCarga } from '../../components/hooks';
import { Aviso, Boton, Campo, DatoFila, Fila, Pantalla, Seccion, Segmentado, Tarjeta, avisar, confirmar } from '../../components/ui';
import { fechaHora } from '../../domain/time';
import {
  compartirArchivo, elegirArchivoTexto, eliminarArchivo, espacioLibreBytes, guardarRespaldoLocal, leerArchivo, listarRespaldosLocales,
} from '../../platform/files';
import { auditar } from '../../repositories/auditoria';
import { validarFraseRespaldo } from '../../security/backupCrypto';
import { exigir } from '../../security/permissions';
import * as backup from '../../services/backupService';
import { ErrorNegocio, mensajeError } from '../../services/contexto';
import { recargarAjustes, useActor, useApp, useDb } from '../../state/app';
import { espacio, tipo } from '../../theme';

const mb = (b: number | null) => (b == null ? '—' : `${(b / 1024 / 1024).toFixed(2).replace('.', ',')} MB`);

/** Respaldo clínico + GPS cifrado (AES-256-GCM, clave derivada de una frase custodiada) y restauración probada. */
export default function Respaldo() {
  const db = useDb();
  const actor = useActor();
  const { ajustes } = useApp();
  const { ocupado, ejecutar } = useAccion();
  const [frase, setFrase] = useState('');
  const [frase2, setFrase2] = useState('');
  const [fraseRest, setFraseRest] = useState('');
  const [modo, setModo] = useState<backup.ModoRestauracion>('FUSIONAR');
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: string } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const locales = useCarga(async () => {
    exigir(actor.rol, 'respaldo.gestionar');
    return listarRespaldosLocales();
  }, []);

  const errFrase = frase ? validarFraseRespaldo(frase) : null;
  const verificado = Number(ajustes.respaldo_verificado_at);

  const crear = () =>
    ejecutar(async () => {
      setResultado(null);
      try {
        const libre = espacioLibreBytes();
        if (libre != null && libre < 20 * 1024 * 1024) throw new ErrorNegocio('Espacio libre insuficiente en el dispositivo (< 20 MB).');
        const { sobre, conteos } = await backup.crearRespaldo(db, actor, frase);
        const d = new Date(sobre.creado);
        const nombre = `vitalis-respaldo-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.vpbak`;
        const r = await guardarRespaldoLocal(nombre, JSON.stringify(sobre));
        setFrase('');
        setFrase2('');
        setResultado(`Respaldo cifrado creado (${mb(r.tamano)}): ${conteos.pacientes ?? 0} pacientes, ${conteos.atenciones ?? 0} atenciones, ${conteos.rutas ?? 0} rutas. Verifíquelo con su clave para completar la prueba de restauración.`);
        await locales.recargar();
      } catch (e) {
        setResultado(mensajeError(e));
      }
    });

  const usarLocal = (uri: string, nombre: string) =>
    ejecutar(async () => {
      try {
        setArchivo({ nombre, contenido: await leerArchivo(uri) });
      } catch (e) {
        avisar('Respaldo', mensajeError(e), 'error');
      }
    });

  const elegir = () =>
    ejecutar(async () => {
      try {
        const a = await elegirArchivoTexto();
        if (a) setArchivo(a);
      } catch (e) {
        avisar('Respaldo', e instanceof Error ? e.message : mensajeError(e), 'error');
      }
    });

  const verificar = () =>
    ejecutar(async () => {
      if (!archivo) return;
      try {
        const r = await backup.verificarRespaldo(db, actor, archivo.contenido, fraseRest);
        await recargarAjustes();
        setResultado(`Verificación correcta. Creado ${fechaHora(r.creado)} en dispositivo ${r.dispositivo.slice(0, 8)}: ${Object.entries(r.conteos).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
      } catch (e) {
        setResultado(mensajeError(e));
      }
    });

  const restaurar = () =>
    ejecutar(async () => {
      if (!archivo) return;
      const texto = modo === 'REEMPLAZAR'
        ? 'Se REEMPLAZARÁN todos los datos clínicos y GPS de este dispositivo por los del respaldo. Los usuarios locales se conservan.'
        : 'Se agregarán los registros del respaldo cuyo UUID no exista en este dispositivo.';
      if (!(await confirmar('Restaurar respaldo', texto, { destructivo: modo === 'REEMPLAZAR', textoOk: 'Restaurar' }))) return;
      try {
        const r = await backup.restaurar(db, actor, archivo.contenido, fraseRest, modo);
        await recargarAjustes();
        setResultado(`Restauración completada (${modo.toLowerCase()}): ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}. Los usuarios restaurados quedan inactivos hasta restablecer su contraseña.`);
        setFraseRest('');
      } catch (e) {
        setResultado(mensajeError(e));
      }
    });

  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Respaldos cifrados' }} />
      <Aviso tono="info" texto="Los respaldos incluyen datos clínicos y GPS, cifrados con AES-256-GCM. La clave de respaldo NO se guarda: custódiela por separado. Sin ella el respaldo es irrecuperable." />
      <DatoFila etiqueta="Última verificación de restauración" valor={verificado > 0 ? fechaHora(verificado) : 'Nunca'} tono={verificado > 0 ? undefined : 'aviso'} />

      <Seccion titulo="1. Crear respaldo">
        <Tarjeta>
          <Campo etiqueta="Clave de respaldo" value={frase} onChangeText={setFrase} secureTextEntry autoCapitalize="none" error={errFrase ?? undefined} ayuda="Mínimo 12 caracteres con letras y números." />
          <Campo etiqueta="Repetir clave" value={frase2} onChangeText={setFrase2} secureTextEntry autoCapitalize="none" error={frase2 && frase2 !== frase ? 'No coincide' : undefined} />
          <Boton titulo="Crear respaldo cifrado" icono={Database} onPress={crear} cargando={ocupado} deshabilitado={!frase || !!errFrase || frase !== frase2} />
          <Text style={[tipo.nota, { marginTop: espacio.sm }]}>El cifrado puede tardar unos segundos (derivación de clave PBKDF2).</Text>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Respaldos en este dispositivo">
        {(locales.datos ?? []).length === 0 ? <Text style={tipo.nota}>No hay respaldos locales.</Text> : null}
        {(locales.datos ?? []).map((r) => (
          <Tarjeta key={r.uri}>
            <Text style={tipo.cuerpo}>{r.nombre}</Text>
            <Text style={tipo.nota}>{mb(r.tamano)}</Text>
            <Fila style={{ marginTop: espacio.sm }}>
              <Boton titulo="Usar" compacto variante="secundario" onPress={() => usarLocal(r.uri, r.nombre)} />
              <Boton
                titulo="Compartir"
                icono={Share2}
                compacto
                variante="secundario"
                onPress={() =>
                  ejecutar(async () => {
                    try {
                      await compartirArchivo(r.uri, 'Guardar respaldo cifrado');
                      await auditar(db, { usuarioId: actor.id, entidad: 'respaldo', accion: 'RESPALDO_CREAR', detalle: 'compartido manualmente' });
                    } catch (e) {
                      avisar('Respaldo', mensajeError(e), 'error');
                    }
                  })
                }
              />
              <Boton
                titulo=""
                icono={Trash2}
                compacto
                variante="fantasma"
                etiquetaAccesible="Eliminar respaldo"
                onPress={() =>
                  ejecutar(async () => {
                    if (!(await confirmar('Eliminar respaldo', r.nombre, { destructivo: true, textoOk: 'Eliminar' }))) return;
                    eliminarArchivo(r.uri);
                    await locales.recargar();
                  })
                }
              />
            </Fila>
          </Tarjeta>
        ))}
        <Text style={tipo.nota}>Compartir abre el menú del sistema para copiarlo a un medio custodiado (no hay subida automática a la nube).</Text>
      </Seccion>

      <Seccion titulo="2. Verificar o restaurar">
        <Tarjeta>
          <Boton titulo="Elegir archivo .vpbak" icono={FolderOpen} variante="secundario" onPress={elegir} deshabilitado={ocupado} />
          {archivo ? <Text style={[tipo.secundario, { marginVertical: espacio.sm }]}>Seleccionado: {archivo.nombre}</Text> : null}
          <Campo etiqueta="Clave del respaldo" value={fraseRest} onChangeText={setFraseRest} secureTextEntry autoCapitalize="none" />
          <Boton titulo="Verificar (prueba de restauración sin aplicar)" icono={ShieldCheck} onPress={verificar} cargando={ocupado} deshabilitado={!archivo || !fraseRest} />
          <View style={{ height: espacio.md }} />
          <Segmentado etiqueta="Modo de restauración" valor={modo} onCambio={setModo} opciones={[{ valor: 'FUSIONAR', texto: 'Fusionar por UUID' }, { valor: 'REEMPLAZAR', texto: 'Reemplazar todo' }]} />
          <Boton titulo="Restaurar" variante="peligro" onPress={restaurar} deshabilitado={!archivo || !fraseRest || ocupado} />
        </Tarjeta>
      </Seccion>
      {resultado ? <Aviso tono="info" texto={resultado} /> : null}
    </Pantalla>
  );
}
