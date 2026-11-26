/**
 * Manual de usuario mostrado dentro de la app (Ajustes › Manual y en la pantalla de ingreso).
 * Escrito para el equipo de campo: pasos cortos, sin términos técnicos.
 */
export type IconoManual =
  | 'inicio' | 'ingreso' | 'atencion' | 'paciente' | 'gps' | 'historial' | 'campana'
  | 'evaluacion' | 'estadisticas' | 'respaldo' | 'seguridad' | 'actualizar' | 'ayuda';

export interface Bloque {
  /** Subtítulo opcional del bloque. */
  titulo?: string;
  /** Pasos numerados. */
  pasos?: string[];
  /** Párrafos o viñetas. */
  puntos?: string[];
  /** Consejo destacado. */
  consejo?: string;
}

export interface SeccionManual {
  id: string;
  titulo: string;
  resumen: string;
  icono: IconoManual;
  /** Quién la usa (texto informativo). */
  para?: string;
  bloques: Bloque[];
}

export const MANUAL: SeccionManual[] = [
  {
    id: 'empezar',
    titulo: 'Primeros pasos',
    resumen: 'Instalar, entrar y activar la huella',
    icono: 'ingreso',
    para: 'Todos',
    bloques: [
      {
        titulo: 'Instalar la app',
        pasos: [
          'Abra en el celular el enlace de descarga que le compartió el responsable.',
          'Abra el archivo descargado y toque Instalar. Si Android lo pide, permita "Instalar apps desconocidas".',
          'Si aparece Play Protect, elija "Instalar de todas formas" (la app no está en la Play Store).',
        ],
      },
      {
        titulo: 'Entrar por primera vez',
        pasos: [
          'Escriba el usuario y la contraseña temporal que le dio el administrador.',
          'La app le pedirá crear su propia contraseña: mínimo 8 caracteres, con letras y números.',
          'Listo: verá la pantalla de Inicio.',
        ],
        consejo: 'Su contraseña es personal. No la comparta: todo lo que registre queda a su nombre.',
      },
      {
        titulo: 'Entrar con huella, rostro o PIN',
        pasos: [
          'Vaya a Ajustes › "Entrar con huella…" y actívelo.',
          'Confirme con su huella, rostro o el PIN del teléfono.',
          'Desde ahora, al abrir la app se pedirá la huella automáticamente.',
        ],
        puntos: ['Si cambia su contraseña, vuelva a activar la huella.', 'Solo una persona por teléfono puede usar este acceso.'],
      },
      {
        titulo: 'Bloqueo automático',
        puntos: [
          'Si no toca la app por unos minutos, se bloquea para proteger los datos. Desbloquee con su huella o contraseña.',
          'El recorrido GPS sigue grabando aunque la app esté bloqueada.',
        ],
      },
    ],
  },
  {
    id: 'inicio',
    titulo: 'La pantalla de Inicio',
    resumen: 'Qué significa cada parte',
    icono: 'inicio',
    para: 'Todos',
    bloques: [
      {
        puntos: [
          'Arriba: saludo, fecha y la campaña en la que está trabajando. Tóquela para cambiar de campaña.',
          'Las cifras blancas son de HOY: atenciones, pacientes y puntos de brigada.',
          'Botones grandes: Nueva atención, Buscar paciente, Iniciar/Ver ruta e Historial.',
          'Si hay un aviso amarillo de "valores atípicos", el personal médico debe revisarlos.',
          'Más abajo están los indicadores de la campaña. Deslice hacia abajo para actualizarlos.',
        ],
      },
      {
        titulo: 'Franjas de colores arriba de la pantalla',
        puntos: [
          'Amarilla "Modo de prueba": se pueden usar solo datos inventados.',
          'Naranja "GPS activo": el recorrido se está grabando. Tóquela para verlo.',
          'Roja "Recorrido interrumpido": la app se cerró durante un recorrido; tóquela para reanudar o finalizar.',
          'Azul "Nueva versión disponible": hay una actualización. Tóquela para instalarla.',
        ],
      },
    ],
  },
  {
    id: 'atencion',
    titulo: 'Registrar una atención (signos vitales)',
    resumen: 'El paso a paso más usado en la brigada',
    icono: 'atencion',
    para: 'Operadores y personal médico',
    bloques: [
      {
        pasos: [
          'Toque "Nueva atención".',
          'Busque al paciente por código, nombre, apellido o celular. Si no aparece, toque "Registrar paciente nuevo".',
          'Escriba las mediciones. Use el botón "Siguiente" del teclado para saltar al próximo campo.',
          'El IMC se calcula solo cuando hay peso y talla.',
          'Toque "Revisar", compare con lo medido y toque "Confirmar y guardar".',
          'Espere la pantalla verde "Atención guardada" y la vibración: recién ahí está guardada.',
        ],
        consejo: 'Mida primero y escriba después. El tiempo de registro se mide desde que empieza a escribir.',
      },
      {
        titulo: 'Buenas prácticas',
        puntos: [
          'Si no midió algo, déjelo vacío. Nunca escriba 0.',
          'Use coma o punto para decimales (36,5 o 36.5).',
          'Peso en kilos y talla en centímetros (165, no 1,65).',
          'Si un campo se pone en ámbar es un valor fuera de lo habitual: vuelva a medir si tiene dudas.',
          'Si hay valores atípicos, antes de guardar debe marcar "Verifiqué los valores". Quedarán para revisión médica (no es un diagnóstico).',
          'En "Observaciones" escriba solo información autorizada.',
          'Tapón de cerumen: elija Sí, No o No evaluado para cada oído.',
        ],
      },
      {
        titulo: 'Si se equivocó al registrar',
        puntos: [
          'En la pantalla verde "Atención guardada" toque "Editar esta atención", corrija y escriba el motivo.',
          'Cada operador puede corregir solo las atenciones que él registró; el personal médico puede corregir todas.',
          'Se guarda la versión anterior: nada se pierde.',
        ],
      },
      {
        titulo: 'Seguimiento y cita',
        puntos: ['Active "Requiere seguimiento" si el paciente debe volver. Puede proponer una cita con fecha y hora (AAAA-MM-DD HH:MM).'],
      },
    ],
  },
  {
    id: 'pacientes',
    titulo: 'Pacientes',
    resumen: 'Buscar, registrar, duplicados y contacto',
    icono: 'paciente',
    para: 'Operadores y personal médico',
    bloques: [
      {
        titulo: 'Registrar un paciente',
        pasos: [
          'Pestaña Pacientes › "Nuevo paciente" (o desde Nueva atención).',
          'Escriba nombres, apellidos, edad y sector o comunidad. Toque un sector de la lista para no escribirlo.',
          'El celular solo es necesario si la persona acepta ser contactada.',
          'Guarde. La app le asigna un código (ej. P-TOGL-0007: zona del sector + número): anótelo en la ficha de papel si la usan.',
        ],
      },
      {
        titulo: 'Si la app dice "Posibles duplicados"',
        puntos: [
          'Revise la lista: si es la misma persona, toque "Es este paciente: usarlo".',
          'Si es otra persona con datos parecidos, toque "Es otra persona: crear registro nuevo".',
          'La app nunca junta registros por su cuenta.',
        ],
      },
      {
        titulo: 'Consentimiento de contacto',
        puntos: [
          'Pregunte si autoriza ser contactado para seguimiento. Por defecto está apagado.',
          'Si acepta, elija WhatsApp o SMS. La app solo guarda la autorización; no envía mensajes.',
        ],
      },
      {
        titulo: 'Ficha del paciente (personal médico)',
        puntos: [
          'Muestra los datos, la evolución de los signos (comparado con la medición anterior) y todas sus atenciones.',
          'Cada vez que alguien abre una ficha queda registrado.',
        ],
      },
    ],
  },
  {
    id: 'gps',
    titulo: 'Recorrido GPS del equipo',
    resumen: 'Grabar la ruta de la brigada',
    icono: 'gps',
    para: 'Operadores y personal médico',
    bloques: [
      {
        pasos: [
          'Pestaña Recorrido › elija "A pie" o "Vehículo" › "Iniciar recorrido".',
          'Acepte el permiso de ubicación. Para que siga grabando con la pantalla apagada toque "Permitir" y elija "Permitir todo el tiempo".',
          'Trabaje normalmente: puede usar los demás módulos; la franja naranja indica que sigue grabando.',
          'Use "Pausar" en descansos largos y "Reanudar" para seguir.',
          'Al terminar la jornada toque "Finalizar".',
        ],
        consejo: 'No hace falta marcar paradas. La app reconoce sola cuando el equipo está en brigada tomando signos.',
      },
      {
        titulo: 'Qué detecta automáticamente',
        puntos: [
          'EN BRIGADA · TOMANDO SIGNOS: el equipo está quieto en un lugar y se guardan atenciones (círculo verde en el mapa con el número de atenciones).',
          'DETENIDO: quieto 3 minutos o más sin atenciones (círculo gris).',
          'EN MOVIMIENTO: el resto del tiempo.',
          'La ruta guarda solo la hora de cada atención, nunca datos del paciente.',
        ],
      },
      {
        titulo: 'Sin internet o sin señal',
        puntos: [
          'El GPS funciona sin internet. Sin conexión, el mapa se dibuja como trazado esquemático con escala.',
          'Si se pierde la señal por más de 2 minutos, la ruta se corta en un nuevo tramo. No se inventan posiciones.',
          'La distancia es siempre una estimación.',
          'El mapa está bloqueado para que la pantalla se desplace con normalidad. Toque el candado para moverlo y otra vez para bloquearlo.',
        ],
      },
      {
        titulo: 'Si la app se cerró',
        puntos: ['Al volver verá "Recorrido interrumpido". Toque Reanudar (empieza un tramo nuevo) o Finalizar.'],
      },
    ],
  },
  {
    id: 'historial',
    titulo: 'Historial, correcciones y revisión',
    resumen: 'Buscar atenciones pasadas y corregir',
    icono: 'historial',
    para: 'Personal médico',
    bloques: [
      {
        puntos: [
          'Inicio › Historial: filtre por campaña, sector, fechas, pendientes de revisión o con seguimiento.',
          'Toque una atención para ver el detalle.',
          '"Marcar como revisada": confirma que el personal médico revisó los valores atípicos.',
          '"Corregir datos": pide el motivo y guarda la versión anterior. Nada se pierde.',
          '"Anular": pide el motivo; el registro no se borra, queda marcado como anulado.',
        ],
      },
    ],
  },
  {
    id: 'campanas',
    titulo: 'Campañas',
    resumen: 'Crear la jornada y elegir dónde se trabaja',
    icono: 'campana',
    para: 'Administrador (crear) · Todos (elegir)',
    bloques: [
      {
        pasos: [
          'Ajustes › Campañas › "Nueva campaña": nombre, sector, fechas, responsable y estado "Activa".',
          'En cada teléfono toque "Trabajar en esta campaña" para elegirla.',
          'Al terminar, edítela y póngala en "Cerrada". Las campañas no se borran.',
        ],
        consejo: 'Sin una campaña activa no se pueden registrar atenciones ni recorridos.',
      },
    ],
  },
  {
    id: 'evaluacion',
    titulo: 'Evaluación del piloto (papel vs. app)',
    resumen: 'Medir tiempos y errores de cada método',
    icono: 'evaluacion',
    para: 'Equipo del proyecto',
    bloques: [
      {
        puntos: [
          'Las atenciones hechas en la app se miden solas (tiempo, búsqueda, faltantes, errores).',
          'Grupo de papel o Excel: Estadísticas › "Gestionar evaluación" › "Registro papel/Excel". Use el cronómetro: inicie al empezar a escribir y detenga al terminar.',
          'Use siempre su código de operador (ej. OP-03), nunca su nombre.',
          'Después de comparar con la ficha de papel, toque cada registro y anote los "errores verificados".',
          'Al final de la jornada, cada integrante llena la "Encuesta" (satisfacción del 1 al 5).',
          'Meta: unos 30 registros por grupo.',
        ],
      },
    ],
  },
  {
    id: 'estadisticas',
    titulo: 'Estadísticas y exportar',
    resumen: 'Gráficos y archivos para el informe',
    icono: 'estadisticas',
    para: 'Personal médico y analistas',
    bloques: [
      {
        puntos: [
          'Elija la campaña actual o todas.',
          'Verá atenciones por sector y por día, IMC, mediciones faltantes, oídos, recorridos y la comparación papel/Excel/app.',
          '"CSV matriz" y "CSV satisfacción" generan archivos sin nombres, teléfonos ni signos vitales, listos para Excel.',
          'Los recorridos se exportan en GeoJSON: use la versión "generalizada" para informes.',
        ],
      },
    ],
  },
  {
    id: 'respaldo',
    titulo: 'Respaldos',
    resumen: 'Guardar una copia protegida de los datos',
    icono: 'respaldo',
    para: 'Administrador',
    bloques: [
      {
        pasos: [
          'Ajustes › Respaldos cifrados › escriba una clave de respaldo (12+ caracteres) › "Crear respaldo".',
          'Guarde la clave en un lugar seguro y aparte. Sin ella el respaldo no se puede abrir.',
          'Toque "Compartir" para copiar el archivo a un lugar autorizado (correo institucional, USB, etc.).',
          'Toque "Verificar" con su clave para comprobar que el respaldo sirve.',
        ],
        consejo: 'Haga un respaldo al final de cada jornada.',
      },
    ],
  },
  {
    id: 'seguridad',
    titulo: 'Seguridad y datos reales',
    resumen: 'Usuarios, roles y pasar de prueba a real',
    icono: 'seguridad',
    para: 'Administrador',
    bloques: [
      {
        titulo: 'Crear usuarios',
        puntos: [
          'Ajustes › Usuarios y roles › "Nuevo usuario". Roles: Operador (registra), Personal médico (además ve fichas y corrige), Analista (solo estadísticas) y Administrador.',
          'Si alguien olvidó su contraseña, abra su usuario y use "Restablecer".',
        ],
      },
      {
        titulo: 'Pasar a datos reales',
        pasos: [
          'Toque la franja amarilla "Modo de prueba" o Ajustes › "Pasar a datos reales".',
          'Revise que la seguridad esté en verde, pruebe el respaldo y registre la autorización del consultorio.',
          'Toque "Borrar datos de prueba y pasar a reales". Se borran pacientes, atenciones, campañas y recorridos de prueba; los usuarios se conservan.',
          'Cree la campaña real.',
        ],
      },
    ],
  },
  {
    id: 'actualizar',
    titulo: 'Actualizar la app',
    resumen: 'Instalar versiones nuevas',
    icono: 'actualizar',
    para: 'Todos',
    bloques: [
      {
        pasos: [
          'Cuando hay una versión nueva aparece la franja azul. Tóquela.',
          'Toque "Actualizar ahora": se descarga dentro de la app.',
          'En la ventana de Android toque "Instalar". Sus datos se conservan.',
        ],
        puntos: ['También puede buscarla en Ajustes › Actualizaciones › "Buscar actualización".'],
      },
    ],
  },
  {
    id: 'problemas',
    titulo: 'Problemas frecuentes',
    resumen: 'Qué hacer si algo no funciona',
    icono: 'ayuda',
    para: 'Todos',
    bloques: [
      {
        puntos: [
          '"Cuenta bloqueada": hubo varios intentos fallidos. Espere unos minutos o pida al administrador que restablezca su contraseña.',
          'No aparece la opción de huella: el teléfono necesita tener un bloqueo de pantalla (huella, rostro o PIN).',
          '"Sin señal" en el recorrido: acérquese a un lugar abierto. El recorrido continúa cuando vuelve la señal.',
          'El recorrido se detiene con la pantalla apagada: en el Recorrido toque "Permitir" y elija "Permitir todo el tiempo". Quite el ahorro de batería para Vitalis Pifo.',
          'No puedo registrar atenciones: verifique que haya una campaña activa elegida.',
          'No veo la pestaña Pacientes o Recorrido: su rol no tiene ese permiso; hable con el administrador.',
          'Se acabó la batería o falló el teléfono: siga con fichas de papel y regístrelas después.',
        ],
      },
    ],
  },
];
