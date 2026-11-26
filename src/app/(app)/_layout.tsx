import { Stack } from 'expo-router';
import { colores } from '../../theme';

/** Navegador de pantallas autenticadas (pestañas + flujos). Los títulos los define cada pantalla. */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colores.superficie },
        headerTintColor: colores.primario,
        headerTitleStyle: { color: colores.texto, fontWeight: '700' },
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: colores.fondo },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
