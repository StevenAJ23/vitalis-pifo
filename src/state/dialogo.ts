import * as Haptics from 'expo-haptics';
import { crearStore } from './store';

/** Vibración breve de confirmación/error (silenciosa si el equipo no la soporta). */
function vibrar(tono: TonoDialogo | Notificacion['tono']): void {
  const tipo = tono === 'exito' ? Haptics.NotificationFeedbackType.Success : tono === 'error' ? Haptics.NotificationFeedbackType.Error : tono === 'aviso' ? Haptics.NotificationFeedbackType.Warning : null;
  if (tipo != null) Haptics.notificationAsync(tipo).catch(() => undefined);
}

/**
 * Diálogos y notificaciones propios de la app (reemplazan Alert.alert del sistema).
 * Sin dependencias de React para poder usarse desde servicios de interfaz y estados globales.
 */
export type TonoDialogo = 'info' | 'exito' | 'aviso' | 'error' | 'pregunta';

export interface BotonDialogo {
  texto: string;
  estilo?: 'normal' | 'cancelar' | 'destructivo' | 'principal';
  onPress?: () => void;
}

export interface Dialogo {
  id: number;
  titulo: string;
  mensaje?: string;
  tono: TonoDialogo;
  botones: BotonDialogo[];
}

export interface Notificacion {
  id: number;
  texto: string;
  tono: 'exito' | 'info' | 'error';
}

export const dialogoStore = crearStore<{ cola: Dialogo[]; notificacion: Notificacion | null }>({ cola: [], notificacion: null });

let secuencia = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;

export function mostrarDialogo(d: Omit<Dialogo, 'id'>): void {
  vibrar(d.tono);
  dialogoStore.set((s) => ({ cola: [...s.cola, { ...d, id: ++secuencia }] }));
}

/** Cierra el diálogo visible ejecutando la acción del botón (si la tiene). */
export function cerrarDialogo(boton?: BotonDialogo): void {
  dialogoStore.set((s) => ({ cola: s.cola.slice(1) }));
  boton?.onPress?.();
}

/** Mensaje breve que desaparece solo (confirmaciones de guardado, etc.). */
export function notificar(texto: string, tono: Notificacion['tono'] = 'exito', ms = 2600): void {
  if (temporizador) clearTimeout(temporizador);
  vibrar(tono);
  dialogoStore.set({ notificacion: { id: ++secuencia, texto, tono } });
  temporizador = setTimeout(() => dialogoStore.set({ notificacion: null }), ms);
}

export function avisar(titulo: string, mensaje?: string, tono: TonoDialogo = 'info'): void {
  mostrarDialogo({ titulo, mensaje, tono, botones: [{ texto: 'Entendido', estilo: 'principal' }] });
}

export function confirmar(titulo: string, mensaje: string, opciones?: { textoOk?: string; destructivo?: boolean; textoCancelar?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    mostrarDialogo({
      titulo,
      mensaje,
      tono: opciones?.destructivo ? 'aviso' : 'pregunta',
      botones: [
        { texto: opciones?.textoCancelar ?? 'Cancelar', estilo: 'cancelar', onPress: () => resolve(false) },
        { texto: opciones?.textoOk ?? 'Confirmar', estilo: opciones?.destructivo ? 'destructivo' : 'principal', onPress: () => resolve(true) },
      ],
    });
  });
}
