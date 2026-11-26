import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conectividad, Ruta } from '../domain/types';
import { mensajeError } from '../services/contexto';

/**
 * Carga datos al enfocar la pantalla (refleja cambios hechos en otras pantallas) y cuando cambian `deps`.
 * `deps` deben ser valores primitivos (se comparan por su serialización).
 */
export function useCarga<T>(cargar: () => Promise<T>, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ref = useRef(cargar);
  useEffect(() => {
    ref.current = cargar;
  });
  const clave = JSON.stringify(deps);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await ref.current());
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
    // `clave` fuerza una nueva función (y una recarga) cuando cambian las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useFocusEffect(
    useCallback(() => {
      void recargar();
    }, [recargar]),
  );
  return { datos, error, cargando, recargar, setDatos };
}

/** Ejecuta una acción asíncrona con bloqueo de doble pulsación. */
export function useAccion() {
  const enCurso = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (enCurso.current) return undefined;
    enCurso.current = true;
    setOcupado(true);
    try {
      return await fn();
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }, []);
  return { ocupado, ejecutar };
}

/** Reloj que avanza cada `ms` mientras `activo` sea verdadero. */
export function useReloj(activo: boolean, ms = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [activo, ms]);
  return ahora;
}

/** Duración activa del recorrido, actualizada cada segundo mientras está EN_CURSO. */
export function useDuracionActiva(ruta: Ruta | null): number {
  const enCurso = ruta?.estado === 'EN_CURSO' && !!ruta.tramo_inicio_ms;
  const ahora = useReloj(enCurso);
  if (!ruta) return 0;
  if (enCurso && ruta.tramo_inicio_ms) return ruta.activo_ms + Math.max(0, ahora - ruta.tramo_inicio_ms);
  return ruta.activo_ms;
}

export function useConectividad(): Conectividad {
  const [c, setC] = useState<Conectividad>('DESCONOCIDA');
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setC(s.isConnected == null ? 'DESCONOCIDA' : s.isConnected && s.isInternetReachable !== false ? 'EN_LINEA' : 'SIN_CONEXION');
    });
    return () => unsub();
  }, []);
  return c;
}

export async function conectividadActual(): Promise<Conectividad> {
  try {
    const s = await NetInfo.fetch();
    if (s.isConnected == null) return 'DESCONOCIDA';
    return s.isConnected && s.isInternetReachable !== false ? 'EN_LINEA' : 'SIN_CONEXION';
  } catch {
    return 'DESCONOCIDA';
  }
}
