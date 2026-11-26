import * as SecureStore from 'expo-secure-store';
import { randomBytes } from '../platform/runtime';
import { aHex } from './encoding';

const CLAVE_BD = 'vitalis_pifo_db_key_v1';
const OPCIONES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, // accesible para la tarea GPS en segundo plano
};

/** Obtiene la clave de la base o crea una nueva de 256 bits. Nunca se registra ni se muestra. */
export async function obtenerOCrearClaveBd(): Promise<string> {
  const existente = await SecureStore.getItemAsync(CLAVE_BD, OPCIONES);
  if (existente) {
    if (!/^[0-9a-f]{64}$/.test(existente)) throw new Error('La clave de la base de datos está dañada.');
    return existente;
  }
  const nueva = aHex(randomBytes(32));
  await SecureStore.setItemAsync(CLAVE_BD, nueva, OPCIONES);
  const verificada = await SecureStore.getItemAsync(CLAVE_BD, OPCIONES);
  if (verificada !== nueva) throw new Error('No se pudo guardar la clave en el almacenamiento seguro.');
  return nueva;
}

export async function existeClaveBd(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CLAVE_BD, OPCIONES)) != null;
}

export async function eliminarClaveBd(): Promise<void> {
  await SecureStore.deleteItemAsync(CLAVE_BD, OPCIONES);
}
