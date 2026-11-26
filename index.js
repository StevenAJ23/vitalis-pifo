// Punto de entrada: define la tarea GPS en el ámbito global ANTES de cargar el enrutador.
// Android puede ejecutar el bundle sin interfaz solo para entregar ubicaciones en segundo plano;
// en ese caso no se renderiza ninguna ruta, pero la tarea ya está registrada y persiste los puntos.
import './src/platform/expoRuntime';
import './src/services/gps-task';
import 'expo-router/entry';
