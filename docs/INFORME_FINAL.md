# Informe final · Vitalis Pifo (piloto 15/11/2026)

## Entregables

| Entregable | Ubicación |
|---|---|
| Código fuente | `vitalis-pifo-mobile/` (Expo SDK 58, TypeScript estricto) |
| Esquema y migraciones | `src/db/migrations.ts` (v1, `PRAGMA user_version`) |
| Pruebas automatizadas | `tests/` · 54 pruebas en 5 suites, todas aprobadas |
| APK instalable | `dist-apk/vitalis-pifo-0.2.0.apk` (53,9 MB, arm64-v8a + armeabi-v7a, firma de depuración) · SHA-256 `F278D0CEA942C794CCFFAB10A014EEBAF972CCCE302494E8C2083A4171F36B03` |
| Configuración APK | `app.json`, `plugins/withReleaseSigning.js`, `scripts/build-apk.js` |
| README / manual / arquitectura / API futura | `README.md`, `docs/MANUAL_USUARIO.md`, `docs/ARQUITECTURA.md`, `docs/API_FUTURA.md` |

## Funcionalidades implementadas (según el PDF)

- **Inicio con campaña activa** y accesos rápidos: nueva atención, buscar paciente, iniciar ruta. Dashboard en vivo: pacientes únicos, atenciones (y de hoy), sectores, seguimiento, pendientes de revisión, duración media/mediana de registro, campos faltantes, distancia, duración activa, paradas y rutas.
- **Pacientes**: UUID + código interno por dispositivo, búsqueda por código/nombre/celular/cédula, aviso de duplicados sin fusión, consentimiento de contacto independiente (desactivado por defecto, canal y versión de aviso), campos opcionales activables, ficha con historial (acceso auditado), edición y anulación lógica.
- **Atenciones**: todos los campos del PDF, IMC automático (2 decimales, nulo si falta peso/talla), validación de tipo, rango y coherencia, valores atípicos marcados para revisión médica (sin diagnóstico), revisión previa, guardado transaccional con confirmación solo tras escritura, bloqueo de doble pulsación, correcciones versionadas y auditadas, revisión médica, anulación.
- **Campañas e historial**: crear/editar/cerrar/archivar, selección de campaña de trabajo, historial filtrable por campaña, sector, fechas, revisión y seguimiento.
- **Recorrido GPS**: iniciar/pausar/reanudar/finalizar; un segmento nuevo por reanudación o pérdida de señal; cronómetro activo, distancia estimada, precisión, última lectura, puntos, estado de señal, permisos y modo de captura; aviso persistente en todos los módulos y notificación del servicio en Android; captura en segundo plano con permiso "siempre" (tarea global, persiste sin interfaz) y en primer plano si no; paradas con etiquetas generales; recuperación como interrumpida tras reinicio; mapa con polilíneas por segmento, inicio/fin, paradas, escala y norte; trazado esquemático sin internet; historial y detalle con eventos; exportación GeoJSON precisa o generalizada; depuración por plazo de conservación.
- **Estadísticas**: agregados clínicos (sector, día, IMC, faltantes por campo, oídos) separados de las métricas académicas; comparativo DIGITAL/PAPEL/EXCEL; GPS por campaña.
- **Evaluación del piloto**: fila digital automática por atención (incluye intentos fallidos), registro cronometrado de papel/Excel, errores verificados separados de los de validación, encuesta de satisfacción 1–5 con consolidación y hojas; CSV de matriz y de satisfacción desidentificados.
- **Seguridad**: SQLCipher con clave en Keystore; usuarios y 4 roles; PBKDF2; bloqueo tras intentos fallidos; bloqueo por inactividad; auditoría; bloqueo de capturas de pantalla; `allowBackup=false`; respaldo AES-256-GCM con verificación y restauración (fusionar/reemplazar); modo de datos reales condicionado a controles verificados y autorización registrada; datos sintéticos y purga solo en modo prueba; aviso de privacidad (LOPDP).
- **Preparación para API REST**: `sync_estado`, lotes por UUID y transporte HTTPS inyectable, sin envíos automáticos.

## Verificación realizada

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| ESLint (eslint-config-expo, reglas de React Compiler) | 0 errores · 2 avisos informativos (`watch()` de react-hook-form) |
| Jest (SQLite real con sql.js) | 54/54 aprobadas |
| Bundle Hermes Android (`expo export`) | Correcto |
| `expo-doctor` | 19/20 antes de corregir `splash`; corregido moviéndolo al plugin `expo-splash-screen` |
| Compilación nativa release (Gradle) | Correcta. La APK contiene `libexpo-sqlite.so` enlazada con `libcrypto.so` (SQLCipher) y el bundle incluye la tarea GPS y la verificación `cipher_version` |

Casos del checklist §08 cubiertos por pruebas automatizadas: crear/buscar paciente, duplicados, dos atenciones del mismo paciente, IMC 70 kg/165 cm = 25,71 y nulo sin talla, persistencia al cerrar y reabrir, guardados concurrentes serializados, iniciar/pausar/reanudar/finalizar con distancia, puntos, segmentos y duración, reinicio sin captura, filtros de precisión, repetidas y saltos, roles, bloqueo de login, cifrado y alteración de respaldos, restauración en un dispositivo nuevo, exportación sin identificadores, GeoJSON por segmento, bloqueo del modo real.

## Limitaciones y pendientes

1. **Pruebas en dispositivo real pendientes**: cerrar la app y reabrirla en modo avión, denegar permisos, apagar la ubicación, bloquear la pantalla durante un recorrido, recorrido caminando, dos teléfonos y consumo de batería. Deben hacerse antes del piloto. El usuario pidió probar directamente en su teléfono, por eso no se usó emulador.
2. **Cifrado real en el dispositivo**: la APK incluye SQLCipher, pero la confirmación final es la pantalla *Ajustes › Seguridad* ("Base de datos cifrada · SQLCipher x.y" en verde) en el teléfono.
3. **Firma**: la APK de prueba usa la clave de depuración. Para distribuirla, configure `android/keystore.properties` (ver README).
4. **Segundo plano**: depende del permiso "Permitir todo el tiempo" y de las políticas de batería del fabricante. Si el sistema termina la app, se registra como interrupción (no se promete continuidad).
5. **Mapa base**: sin proveedor de teselas offline con licencia. Se ofrece trazado esquemático y teselas en línea opcionales; no hay descarga masiva de teselas.
6. **PBKDF2 en JavaScript**: 60 000 iteraciones para credenciales, por debajo de la recomendación OWASP para servidores. Mitigado con bloqueo progresivo y base cifrada (ver docs/ARQUITECTURA.md).
7. **Fechas** como texto validado (sin selector nativo).
8. **iOS**: compatible a nivel de arquitectura y configuración, pero no compilado ni probado (requiere macOS).
9. **Autorización legal**: el aviso de privacidad es un texto base; el consultorio debe validarlo antes de habilitar datos reales.
10. **Compilación en Windows**: requiere una ruta de proyecto corta y `ninja` ≥ 1.12 (ver README).
