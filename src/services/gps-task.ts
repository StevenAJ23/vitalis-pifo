/**
 * Tarea de ubicación en segundo plano. DEBE importarse en el ámbito global del bundle (src/app/_layout.tsx),
 * no dentro de un componente: Android puede iniciar el JS sin interfaz solo para ejecutar esta tarea, y entonces
 * los puntos se persisten directamente en la base cifrada.
 */
import '../platform/expoRuntime';
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ingerir, registrarErrorTarea, TAREA_GPS } from './gpsIngesta';

if (!TaskManager.isTaskDefined(TAREA_GPS)) {
  TaskManager.defineTask<{ locations: LocationObject[] }>(TAREA_GPS, async ({ data, error }) => {
    if (error) {
      await registrarErrorTarea(error.message || 'Error del servicio de ubicación');
      return;
    }
    const locs = data?.locations ?? [];
    await ingerir(locs);
  });
}
