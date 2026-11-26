import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const DIR_EXPORTES = 'exportes';
const DIR_RESPALDOS = 'respaldos';

function directorio(base: Directory, nombre: string): Directory {
  const d = new Directory(base, nombre);
  if (!d.exists) d.create();
  return d;
}

function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Escribe un archivo temporal de exportación y abre el diálogo de compartir del sistema.
 * La transferencia es siempre manual (nunca automática a la nube). Los temporales se eliminan en el siguiente inicio.
 */
export async function compartirTexto(nombre: string, contenido: string, mimeType: string, titulo: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos.');
  const f = new File(directorio(Paths.cache, DIR_EXPORTES), nombreSeguro(nombre));
  if (f.exists) f.delete();
  f.create();
  await f.write(contenido);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: titulo });
}

/** Elimina exportaciones temporales (CSV/GeoJSON) de sesiones anteriores. */
export function limpiarExportes(): void {
  try {
    const d = new Directory(Paths.cache, DIR_EXPORTES);
    if (d.exists) d.delete();
  } catch {
    // limpieza oportunista: si falla se reintenta en el próximo inicio
  }
}

export interface RespaldoLocal {
  nombre: string;
  uri: string;
  tamano: number | null;
}

/** Guarda un respaldo cifrado en el almacenamiento privado de la app. */
export async function guardarRespaldoLocal(nombre: string, contenido: string): Promise<RespaldoLocal> {
  const f = new File(directorio(Paths.document, DIR_RESPALDOS), nombreSeguro(nombre));
  if (f.exists) f.delete();
  f.create();
  await f.write(contenido);
  return { nombre: f.name, uri: f.uri, tamano: f.size ?? null };
}

export function listarRespaldosLocales(): RespaldoLocal[] {
  const d = new Directory(Paths.document, DIR_RESPALDOS);
  if (!d.exists) return [];
  return d
    .list()
    .filter((x): x is File => x instanceof File && x.name.endsWith('.vpbak'))
    .map((f) => ({ nombre: f.name, uri: f.uri, tamano: f.size ?? null }))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

export async function leerArchivo(uri: string): Promise<string> {
  return new File(uri).text();
}

export function eliminarArchivo(uri: string): void {
  const f = new File(uri);
  if (f.exists) f.delete();
}

export async function compartirArchivo(uri: string, titulo: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos.');
  await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: titulo });
}

/** Selector de archivo para restaurar un respaldo; devuelve el texto o null si se cancela. */
export async function elegirArchivoTexto(): Promise<{ nombre: string; contenido: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  if (a.size != null && a.size > 200 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
  const contenido = await new File(a.uri).text();
  try {
    new File(a.uri).delete(); // copia temporal en caché
  } catch {
    // la copia temporal la limpia el sistema
  }
  return { nombre: a.name, contenido };
}

export function espacioLibreBytes(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}
