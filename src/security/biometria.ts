import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { randomBytes } from '../platform/runtime';
import { ErrorNegocio } from '../services/contexto';
import { aHex } from './encoding';

/**
 * Acceso rápido con el bloqueo del teléfono: huella, rostro o, si no hay biometría o falla, el PIN/patrón/
 * contraseña del dispositivo (Android BiometricPrompt con DEVICE_CREDENTIAL; iOS Face ID/Touch ID + código).
 *
 * El token (256 bits aleatorios) se guarda en SecureStore cifrado por el Keystore y ligado a este dispositivo
 * (no se respalda ni migra). Solo se lee tras una verificación exitosa del sistema; en la base de datos se guarda
 * únicamente su SHA-256. No se usa `requireAuthentication` de SecureStore porque en Android exige biometría
 * "fuerte" (clase 3) y no admite PIN, lo que fallaba en muchos teléfonos con reconocimiento facial.
 */
const clave = (usuarioId: string) => `vp_acc_${usuarioId.replace(/[^A-Za-z0-9_-]/g, '')}`;
const OPCIONES: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface DisponibilidadBiometria {
  disponible: boolean;
  nombre: string; // texto para la interfaz: "huella", "rostro", "huella o PIN", "PIN o patrón"…
  motivo: string | null;
}

export async function disponibilidad(): Promise<DisponibilidadBiometria> {
  try {
    const [nivel, tipos] = await Promise.all([
      LocalAuthentication.getEnrolledLevelAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (nivel === LocalAuthentication.SecurityLevel.NONE) {
      return { disponible: false, nombre: 'huella o PIN', motivo: 'Configure un bloqueo de pantalla (huella, rostro, PIN o patrón) en el teléfono.' };
    }
    const huella = tipos.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const rostro = tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const conBiometria = nivel !== LocalAuthentication.SecurityLevel.SECRET;
    const nombre = !conBiometria ? 'PIN o patrón' : huella && rostro ? 'huella, rostro o PIN' : rostro ? 'rostro o PIN' : 'huella o PIN';
    return { disponible: true, nombre, motivo: null };
  } catch {
    return { disponible: false, nombre: 'huella o PIN', motivo: 'No se pudo consultar la seguridad del teléfono.' };
  }
}

const MENSAJES: Partial<Record<LocalAuthentication.LocalAuthenticationError, string>> = {
  user_cancel: 'Verificación cancelada.',
  system_cancel: 'Verificación interrumpida por el sistema. Intente de nuevo.',
  app_cancel: 'Verificación interrumpida. Intente de nuevo.',
  lockout: 'Demasiados intentos. Espere un momento o use el PIN del teléfono.',
  not_enrolled: 'No hay huella ni rostro registrados en el teléfono.',
  passcode_not_set: 'Configure un PIN o patrón en el teléfono.',
  not_available: 'La verificación del teléfono no está disponible ahora.',
  authentication_failed: 'No se reconoció. Intente de nuevo.',
  timeout: 'Se agotó el tiempo de verificación.',
};

/** Muestra el diálogo del sistema (huella/rostro con alternativa de PIN). Lanza ErrorNegocio si no se verifica. */
async function verificar(mensaje: string): Promise<void> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: mensaje,
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false, // permite PIN/patrón/contraseña del teléfono
    biometricsSecurityLevel: 'weak', // acepta también reconocimiento facial de clase 2
    requireConfirmation: false,
  });
  if (!r.success) throw new ErrorNegocio(MENSAJES[r.error] ?? 'No se pudo verificar su identidad.');
}

/** Verifica al usuario y crea el token del dispositivo. Devuelve el token para registrar su hash en la base. */
export async function activar(usuarioId: string): Promise<string> {
  await verificar('Confirme para activar el acceso rápido');
  const token = aHex(randomBytes(32));
  await SecureStore.setItemAsync(clave(usuarioId), token, OPCIONES);
  if ((await SecureStore.getItemAsync(clave(usuarioId), OPCIONES)) !== token) {
    throw new ErrorNegocio('No se pudo guardar el acceso en el almacén seguro del teléfono.');
  }
  return token;
}

/** Pide huella/rostro/PIN y devuelve el token del dispositivo. */
export async function obtenerToken(usuarioId: string, mensaje = 'Entrar a Vitalis Pifo'): Promise<string> {
  await verificar(mensaje);
  const token = await SecureStore.getItemAsync(clave(usuarioId), OPCIONES);
  if (!token) throw new ErrorNegocio('El acceso rápido no está configurado en este teléfono. Actívelo de nuevo en Ajustes.');
  return token;
}

export async function eliminar(usuarioId: string): Promise<void> {
  for (const k of [clave(usuarioId), `vp_bio_${usuarioId.replace(/[^A-Za-z0-9_-]/g, '')}`]) {
    try {
      await SecureStore.deleteItemAsync(k, OPCIONES);
    } catch {
      // si no existía no hay nada que borrar
    }
  }
}
