import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

/**
 * Descarga la APK dentro de la app (sin navegador) y abre el instalador del sistema.
 * Android siempre pide la confirmación final "Instalar" (una app normal no puede instalarse en silencio) y
 * verifica que la firma de la APK coincida con la de la app instalada, por lo que una APK ajena se rechaza.
 */
export async function descargarEInstalar(
  url: string,
  version: string,
  tamanoEsperado: number | null,
  onProgreso: (fraccion: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('La instalación directa solo está disponible en Android.');
  const dir = new Directory(Paths.cache, 'actualizaciones');
  if (dir.exists) dir.delete(); // elimina descargas anteriores
  dir.create();
  const destino = new File(dir, `vitalis-pifo-${version.replace(/[^0-9.]/g, '')}.apk`);
  const apk = await File.downloadFileAsync(url, destino, {
    onProgress: (d) => onProgreso(d.totalBytes > 0 ? d.bytesWritten / d.totalBytes : 0),
  });
  onProgreso(1);
  if (tamanoEsperado && apk.size != null && apk.size !== tamanoEsperado) {
    apk.delete();
    throw new Error('La descarga llegó incompleta. Intente de nuevo con mejor conexión.');
  }
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}
