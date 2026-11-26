# Manual breve de usuario · Vitalis Pifo

## 1. Primer uso (administrador)

1. Instale la APK y ábrala. Cree la **cuenta de administrador** (contraseña de 8+ caracteres con letras y números).
2. La app arranca en **modo de prueba** (franja amarilla): use solo datos ficticios.
3. **Ajustes › Usuarios y roles**: cree las cuentas del equipo.
   - *Operador de registro*: registra pacientes y atenciones, captura el recorrido.
   - *Personal médico*: además ve fichas e historial, corrige y revisa valores atípicos.
   - *Analista académico*: solo métricas desidentificadas y evaluación del piloto.
   Cada persona cambia su contraseña temporal en el primer ingreso.
4. **Ajustes › Campañas › Nueva campaña** en estado *Activa*. Cada dispositivo trabaja sobre su campaña activa.

## 2. Registrar una atención (flujo de campo)

1. **Inicio › Nueva atención**. Busque por código, nombre, apellido o celular.
2. Si no existe, **Registrar paciente**: la app advierte posibles duplicados (no fusiona); elija "Es este paciente" o "Es otra persona".
3. Ingrese las mediciones. Deje vacío lo que no se midió (se guarda como "no registrado", nunca como cero). El **IMC** se calcula solo.
4. **Revisar** → verifique el resumen. Si hay **valores atípicos**, confirme que los verificó; quedan marcados para revisión médica (no es diagnóstico).
5. **Confirmar y guardar**: la confirmación verde solo aparece cuando los datos quedaron escritos. El botón se bloquea para evitar doble guardado.

Correcciones (personal médico): abra la atención › **Corregir datos** › indique el motivo. Se guarda la versión anterior y queda en auditoría. Anular requiere motivo; nada se borra.

## 3. Recorrido GPS del equipo

1. Pestaña **Recorrido** › elija *A pie* o *Vehículo* › **Iniciar recorrido**. El permiso de ubicación se pide solo en ese momento; puede negarlo y seguir atendiendo.
2. Verá cronómetro activo, distancia estimada, precisión, puntos y estado de señal. Una franja naranja permanece visible en todos los módulos mientras el GPS está activo.
3. **Pausar / Reanudar** (cada reanudación inicia un nuevo segmento; no se unen tramos) y **Finalizar**.
4. **No hace falta marcar paradas.** La app detecta sola las detenciones (permanecer ~40 m a la redonda): si mientras está detenido se guardan atenciones, ese lugar queda como **punto de brigada (toma de signos)**; si no, como **detenido**. El resto del tiempo cuenta como **en movimiento**. La cabecera muestra en vivo "EN BRIGADA · TOMANDO SIGNOS", "DETENIDO" o "EN MOVIMIENTO", y el mapa marca los puntos de brigada en verde con el número de atenciones. A la ruta solo se le agrega la hora de cada atención, nunca datos del paciente.
5. Para seguir con la pantalla bloqueada pulse **Permitir** y elija "Permitir todo el tiempo"; Android mostrará una notificación persistente. Sin ese permiso la captura sigue mientras la app esté abierta.
6. Sin internet el GPS funciona igual; el mapa se dibuja como **trazado esquemático** con escala aproximada. El mapa base en línea solo aparece si el administrador lo autoriza y hay conexión.
7. Si la app se cierra durante un recorrido, al volver se mostrará **Recorrido interrumpido**: reanude (nuevo segmento) o finalice. La app no inventa posiciones del tiempo sin captura.

## 4. Evaluación del piloto (papel/Excel vs app)

- Las filas **digitales** se crean solas al guardar cada atención (tiempo de ingreso, búsqueda, errores de validación, faltantes, conectividad).
- Grupo manual: **Estadísticas › Gestionar evaluación › Registro papel/Excel**, use el cronómetro (iniciar al empezar a escribir, detener al terminar) y complete los campos con el **código de operador** (nunca nombres).
- Tras comparar con la ficha fuente, toque cada registro y anote los **errores verificados**.
- Al final de la jornada, cada operador completa la **Encuesta** (satisfacción 1–5, consolidación, hojas).
- **CSV matriz** y **CSV satisfacción** exportan datos desidentificados.

## 5. Seguridad diaria

- La sesión se bloquea tras el tiempo de inactividad configurado (por defecto 5 min); el GPS sigue registrando.
- **Respaldo** (administrador): Ajustes › Respaldos cifrados › cree el respaldo con una clave de 12+ caracteres, **custodie la clave aparte**, use *Compartir* para copiarlo a un medio autorizado y luego **Verificar** con su clave (prueba de restauración).
- **Pasar a datos reales** (administrador): toque la franja amarilla "Modo de prueba" o Ajustes › **Pasar a datos reales**. El asistente muestra 4 pasos: (1) controles de seguridad del teléfono, (2) probar el respaldo cifrado con la clave que usará, (3) responsable y referencia de la autorización del consultorio, (4) **Borrar datos de prueba y pasar a reales**. Se eliminan pacientes, atenciones, campañas, recorridos y evaluaciones de prueba; los usuarios y contraseñas se conservan. Después cree la campaña real. Debe finalizar antes cualquier recorrido GPS abierto.

## 6. Huella o rostro y actualizaciones

- **Acceso rápido (huella, rostro o PIN)**: Ajustes › *Entrar con huella…* (requiere que el teléfono tenga bloqueo de pantalla). Desde entonces, al abrir la app o al desbloquearse por inactividad, se pide la verificación automáticamente; si la huella o el rostro fallan, Android ofrece usar el PIN, patrón o contraseña del teléfono. La contraseña sigue funcionando; si la cambia, vuelva a activar la huella. Es un usuario por teléfono.
- **Actualizaciones**: cuando hay una versión nueva aparece la franja azul *"Nueva versión X disponible"*. Tóquela › **Actualizar ahora**: se descarga dentro de la app (verá el porcentaje) y se abre el instalador; toque **Instalar**. La primera vez Android pide permitir instalar apps desde Vitalis Pifo. Sus datos se conservan.

## 7. Checklist antes de salir a campo

- Batería cargada y power bank; espacio libre > 100 MB.
- Campaña activa seleccionada en cada teléfono; usuarios creados y contraseñas cambiadas.
- Respaldo verificado del día anterior.
- Prueba rápida en modo avión: registrar, cerrar y reabrir la app, comprobar que el registro sigue ahí.
- Fichas de papel de respaldo por si falla un dispositivo.
