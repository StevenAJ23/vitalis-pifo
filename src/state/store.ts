import { useSyncExternalStore } from 'react';

/** Almacén reactivo mínimo (sin dependencias) para estado global de la app. */
export interface Store<T> {
  get(): T;
  set(parcial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

export function crearStore<T extends object>(inicial: T): Store<T> {
  let estado = inicial;
  const subs = new Set<() => void>();
  return {
    get: () => estado,
    set(parcial) {
      const cambios = typeof parcial === 'function' ? parcial(estado) : parcial;
      estado = { ...estado, ...cambios };
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
