import { abrirBaseDatos, type EstadoCifrado } from '../db/expoDb';
import type { Db } from '../db/types';
import type { Campana, Usuario } from '../domain/types';
import { uuid } from '../platform/runtime';
import { AJUSTES_DEFECTO, guardarAjuste, leerTodos, type ClaveAjuste } from '../repositories/ajustes';
import { auditar } from '../repositories/auditoria';
import { existeClaveBd } from '../security/keyStore';
import { aActor, requiereConfiguracionInicial } from '../services/authService';
import * as campanaService from '../services/campanaService';
import type { Actor } from '../services/contexto';
import { crearStore, useStore } from './store';

export interface EstadoApp {
  fase: 'cargando' | 'error' | 'listo';
  error: string | null;
  db: Db | null;
  cifrado: EstadoCifrado;
  claveSegura: boolean;
  requiereConfiguracion: boolean;
  ajustes: Record<ClaveAjuste, string>;
  campanaActiva: Campana | null;
}

export const appStore = crearStore<EstadoApp>({
  fase: 'cargando',
  error: null,
  db: null,
  cifrado: { sqlcipher: false, version: null },
  claveSegura: false,
  requiereConfiguracion: false,
  ajustes: { ...AJUSTES_DEFECTO },
  campanaActiva: null,
});

export async function iniciarApp(): Promise<void> {
  appStore.set({ fase: 'cargando', error: null });
  try {
    const { db, cifrado } = await abrirBaseDatos();
    let ajustes = await leerTodos(db);
    if (!ajustes.dispositivo_id) {
      await guardarAjuste(db, 'dispositivo_id', uuid());
      ajustes = await leerTodos(db);
    }
    appStore.set({
      db,
      cifrado,
      claveSegura: await existeClaveBd(),
      ajustes,
      requiereConfiguracion: await requiereConfiguracionInicial(db),
      campanaActiva: await campanaService.activa(db),
      fase: 'listo',
    });
  } catch (e) {
    appStore.set({ fase: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function recargarAjustes(): Promise<void> {
  const db = appStore.get().db;
  if (!db) return;
  appStore.set({
    ajustes: await leerTodos(db),
    campanaActiva: await campanaService.activa(db),
    requiereConfiguracion: await requiereConfiguracionInicial(db),
  });
}

export async function cambiarAjuste(clave: ClaveAjuste, valor: string, actorId: string | null): Promise<void> {
  const db = appStore.get().db;
  if (!db) return;
  await guardarAjuste(db, clave, valor);
  await auditar(db, { usuarioId: actorId, entidad: 'ajustes', entidadId: clave, accion: 'AJUSTE' });
  await recargarAjustes();
}

/** Usuario que activó el acceso con huella/rostro en este dispositivo (uno por teléfono). */
export function usuarioBiometrico(ajustes: Record<ClaveAjuste, string>): { id: string; nombre: string } | null {
  try {
    const v = JSON.parse(ajustes.biometria_usuario || 'null') as { id?: string; nombre?: string } | null;
    return v?.id ? { id: v.id, nombre: v.nombre ?? '' } : null;
  } catch {
    return null;
  }
}

export function useApp(): EstadoApp {
  return useStore(appStore);
}

export function useDb(): Db {
  const db = useStore(appStore).db;
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
}

/* ---------------- Sesión ---------------- */

export interface EstadoSesion {
  usuario: Usuario | null;
  bloqueada: boolean;
  /** Último usuario autenticado (solo para el render final de pantallas que se están desmontando). */
  ultimoUsuario: Usuario | null;
}

export const sesionStore = crearStore<EstadoSesion>({ usuario: null, bloqueada: false, ultimoUsuario: null });

/** Marca temporal de la última interacción (fuera del store para no re-renderizar en cada toque). */
let ultimaActividad = Date.now();

export function msDesdeActividad(): number {
  return Date.now() - ultimaActividad;
}

export function useSesion(): EstadoSesion {
  return useStore(sesionStore);
}

/**
 * Actor de la sesión. Al cerrar sesión, las pantallas protegidas pueden renderizarse una última vez antes de que
 * la navegación las desmonte: se usa el último usuario conocido solo para ese render (los servicios vuelven a
 * validar permisos y no hay interacción posible porque el guardia ya retiró las rutas).
 */
export function useActor(): Actor {
  const { usuario, ultimoUsuario } = useStore(sesionStore);
  const u = usuario ?? ultimoUsuario;
  if (!u) throw new Error('Sesión no iniciada');
  return aActor(u);
}

export function registrarActividad(): void {
  if (!sesionStore.get().bloqueada) ultimaActividad = Date.now();
}

export function iniciarSesionEnStore(u: Usuario): void {
  ultimaActividad = Date.now();
  sesionStore.set({ usuario: u, ultimoUsuario: u, bloqueada: false });
}

export function cerrarSesionEnStore(): void {
  sesionStore.set({ usuario: null, bloqueada: false });
}

export function bloquearSesion(): void {
  if (sesionStore.get().usuario) sesionStore.set({ bloqueada: true });
}

export function desbloquearSesion(): void {
  ultimaActividad = Date.now();
  sesionStore.set({ bloqueada: false });
}
