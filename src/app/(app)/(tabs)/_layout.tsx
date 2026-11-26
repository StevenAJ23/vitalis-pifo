import { Tabs } from 'expo-router';
import { ChartColumn, House, Route, Settings, Users } from 'lucide-react-native';
import { gpsStore } from '../../../services/gpsIngesta';
import { puede } from '../../../security/permissions';
import { useSesion } from '../../../state/app';
import { useStore } from '../../../state/store';
import { colores } from '../../../theme';

export default function TabsLayout() {
  const rol = useSesion().usuario?.rol;
  const gps = useStore(gpsStore);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoTenue,
        tabBarStyle: { minHeight: 60, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: colores.superficie },
        headerTitleStyle: { color: colores.texto, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <House color={color} size={22} /> }} />
      <Tabs.Screen
        name="pacientes"
        options={{ title: 'Pacientes', href: puede(rol, 'paciente.buscar') ? undefined : null, tabBarIcon: ({ color }) => <Users color={color} size={22} /> }}
      />
      <Tabs.Screen
        name="recorrido"
        options={{
          title: 'Recorrido',
          href: puede(rol, 'ruta.ver') ? undefined : null,
          tabBarIcon: ({ color }) => <Route color={gps.ruta?.estado === 'EN_CURSO' ? colores.acento : color} size={22} />,
          tabBarBadge: gps.ruta ? (gps.ruta.estado === 'EN_CURSO' ? '●' : '!') : undefined,
          tabBarBadgeStyle: { backgroundColor: gps.ruta?.estado === 'EN_CURSO' ? colores.acento : colores.peligro, color: '#fff', fontSize: 9 },
        }}
      />
      <Tabs.Screen
        name="estadisticas"
        options={{ title: 'Estadísticas', href: puede(rol, 'estadisticas.ver') ? undefined : null, tabBarIcon: ({ color }) => <ChartColumn color={color} size={22} /> }}
      />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ color }) => <Settings color={color} size={22} /> }} />
    </Tabs>
  );
}
