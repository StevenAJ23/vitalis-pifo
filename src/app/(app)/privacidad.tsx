import { Stack } from 'expo-router';
import { Text } from 'react-native';
import { Pantalla, Seccion, Tarjeta } from '../../components/ui';
import { useApp } from '../../state/app';
import { espacio, tipo } from '../../theme';

const BLOQUES: { titulo: string; texto: string }[] = [
  {
    titulo: 'Responsable y finalidad',
    texto:
      'El consultorio que organiza la campaña es responsable del tratamiento. Los datos personales y de salud se recogen únicamente para la atención en la campaña comunitaria, su seguimiento autorizado y la evaluación académica desidentificada del piloto (Ley Orgánica de Protección de Datos Personales del Ecuador, LOPDP).',
  },
  {
    titulo: 'Datos que se registran',
    texto:
      'Nombres, apellidos, edad, sector y —solo si se necesita contacto— celular. Cédula, fecha de nacimiento y sexo solo si el consultorio justifica su captura. Mediciones: presión arterial, frecuencia cardíaca, temperatura, saturación, peso, talla, IMC, tapón de cerumen y observaciones autorizadas. No se emiten diagnósticos automáticos.',
  },
  {
    titulo: 'Consentimiento de contacto',
    texto:
      'Es independiente de la atención y está desactivado por defecto. Se registra el canal preferido (WhatsApp, SMS o ninguno), la fecha y la versión de este aviso. Puede revocarse en cualquier momento. Esta versión no envía mensajes.',
  },
  {
    titulo: 'Ubicación (GPS)',
    texto:
      'Se registra la ruta del dispositivo del equipo durante la jornada, con inicio y fin explícitos e indicador visible. No se asocian coordenadas a pacientes ni se rastrea fuera de la campaña. El personal puede negarse sin que ello impida la atención. Las rutas se conservan durante el plazo acordado y se depuran después; los informes académicos usan rutas generalizadas.',
  },
  {
    titulo: 'Seguridad',
    texto:
      'Base de datos local cifrada (SQLCipher) con clave en el almacén seguro del sistema, acceso por roles, bloqueo por inactividad, auditoría de accesos y cambios, respaldos cifrados con clave custodiada y sin copias automáticas a la nube. Las exportaciones académicas no contienen nombres, teléfonos, cédulas, coordenadas individuales ni signos vitales.',
  },
  {
    titulo: 'Derechos de los titulares',
    texto:
      'Los titulares pueden ejercer sus derechos de acceso, rectificación, actualización, eliminación, oposición y portabilidad ante el consultorio responsable. Las correcciones se registran con versión y auditoría; los registros no se eliminan accidentalmente.',
  },
];

export default function Privacidad() {
  const { ajustes } = useApp();
  return (
    <Pantalla>
      <Stack.Screen options={{ title: 'Aviso de privacidad' }} />
      <Text style={[tipo.nota, { marginBottom: espacio.md }]}>Versión {ajustes.aviso_version}. Texto base para validar con el consultorio y su asesoría jurídica.</Text>
      {BLOQUES.map((b) => (
        <Tarjeta key={b.titulo}>
          <Seccion titulo={b.titulo}>
            <Text style={[tipo.cuerpo, { lineHeight: 22 }]}>{b.texto}</Text>
          </Seccion>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
