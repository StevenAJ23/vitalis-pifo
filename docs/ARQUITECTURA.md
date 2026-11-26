# Arquitectura y decisiones técnicas

## Capas

```
Pantallas (src/app, src/components)
   │  solo llaman a servicios; nunca SQL
   ▼
Servicios de negocio (src/services)  ← control de acceso (exigir(rol, permiso)) + auditoría + transacciones
   │
   ▼
Repositorios (src/repositories)       ← SQL parametrizado por entidad
   │
   ▼
Db (src/db/types.ts)                  ← interfaz; DbSerializada (mutex + BEGIN IMMEDIATE/COMMIT)
   ├── ExpoDb: expo-sqlite + SQLCipher (dispositivo)
   └── SqlJsDb: sql.js (pruebas en Node con el mismo esquema)
```

- **Dominio puro** (`src/domain`): IMC, rangos vitales y atípicos, Haversine, proyección Web Mercator, filtro GPS, detección de duplicados, estadística. Sin dependencias de plataforma → 100 % testeable.
- **Inversión de dependencias**: UUID, bytes aleatorios y reloj se inyectan (`src/platform/runtime.ts`); la app usa `expo-crypto`, las pruebas `node:crypto` con reloj controlable.
- **Estado global** mínimo con `useSyncExternalStore` (`src/state`): app/ajustes, sesión, GPS. La actividad del usuario se registra fuera del store para no re-renderizar en cada toque.

## Decisiones y justificación

| Tema | Decisión | Motivo |
|---|---|---|
| Transacciones con SQLCipher | Mutex propio + `BEGIN IMMEDIATE` en la **misma** conexión | `withExclusiveTransactionAsync` abre otra conexión que no hereda `PRAGMA key` ni `foreign_keys` (documentado en Expo SQLite v58). |
| Clave de la base | 256 bits aleatorios, hex, en SecureStore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) | Accesible para la tarea GPS con pantalla bloqueada; no migra a otros dispositivos. Se verifica `PRAGMA cipher_version`; si falta SQLCipher se informa y se bloquea el modo real. |
| Credenciales | PBKDF2-SHA256, 60 000 iteraciones, sal 16 B, formato autodescriptivo | `expo-crypto` no expone KDF; @noble es auditada. Iteraciones elegidas por tiempo de login en Hermes; se compensa con bloqueo progresivo (5 intentos → 5 min, duplicando hasta 1 h) y con que los hashes residen en la base cifrada. Las iteraciones se guardan por hash para poder aumentarlas. |
| Respaldos | AES-256-GCM, clave PBKDF2 (150 000 it.) de una frase ≥ 12 caracteres; cabecera autenticada (AAD) | Respaldo portátil entre dispositivos (la clave de SQLCipher no sale del Keystore). Sin credenciales: los usuarios restaurados quedan inactivos. |
| Restauración | `FUSIONAR` (INSERT OR IGNORE por UUID) o `REEMPLAZAR`; columnas en lista blanca vía `PRAGMA table_info`; `foreign_key_check` antes de confirmar | Consolidación multi-dispositivo y prueba de restauración segura. |
| Mapa | Proyección propia + SVG; teselas XYZ opcionales | `react-native-maps` en Android exige Google Maps SDK con clave de API ligada a facturación (servicio externo de pago/condicionado). La especificación lo propone como sugerencia; se sustituye sin perder funcionalidad: polilíneas por segmento, inicio/fin, paradas, escala, norte, zoom/desplazamiento. Sin internet o sin autorización → trazado esquemático. Las teselas se desactivan por defecto porque revelan el área al proveedor. |
| Captura GPS | Servicio de aplicación (no de pantalla); tarea en segundo plano si hay permiso "siempre", si no `watchPositionAsync` | La captura sobrevive a la navegación entre módulos; la tarea se define en ámbito global e ingiere sin interfaz. |
| Ingesta | Cola serializada + una transacción por lote; `INSERT OR IGNORE` con `UNIQUE(ruta_id, segmento, fecha_ms)`; acumulados en la misma transacción | Idempotencia ante lotes repetidos del SO; nunca se suma distancia de puntos no insertados. |
| Filtro GPS | Inválidas, precisión desconocida o > 30 m, repetidas (desplazamiento < max(5 m, ½ precisión)), saltos > 4 m/s a pie / 40 m/s en vehículo; 3 saltos coherentes → nuevo segmento; pérdida > 120 s → nuevo segmento | Requisitos §05; evita deriva estando quieto y no une tramos dudosos. Parámetros configurables. |
| Reinicio de la app | Ruta `EN_CURSO` sin captura viva → `INTERRUMPIDA`; tiempo activo hasta la última lectura real | "Recuperar como interrumpida y pedir reanudación"; no inventar actividad. |
| Paradas | Lista cerrada de etiquetas generales | "Sin datos personales". Las coordenadas nunca se vinculan a `paciente_id`. |
| Evaluación | Fila `DIGITAL` automática por atención (misma transacción); intentos fallidos registrados con `guardado_exitoso=0`; papel/Excel con cronómetro; errores verificados separados de los de validación | Diseño comparativo §07. El tiempo se mide desde la primera edición del formulario hasta el guardado. |
| Exportación académica | CSV con código aleatorio, sin `atencion_id`, nombres, teléfonos, cédulas, coordenadas ni signos vitales; BOM UTF-8; neutralización de fórmulas | Separar métricas académicas de datos clínicos; OWASP CSV Injection. |
| Modo de datos | `SINTETICO` por defecto; `REAL` solo si pasan todos los controles, hay autorización registrada y la base está vacía | Criterio de salida §07. |
| Eliminación | Anulación lógica con motivo (pacientes, atenciones); campañas se cierran/archivan | "Evitar borrado físico accidental". Excepción explícita: purga de datos de prueba (modo prueba) y depuración por plazo de conservación GPS. |
| Fechas | Entrada `AAAA-MM-DD` / `AAAA-MM-DD HH:MM` validada, con atajo de fecha propuesta | Evita una dependencia nativa adicional (date picker) en la compilación del piloto. |
| Futuro servidor | `sync_estado` + lotes por UUID + transporte HTTPS inyectable | Preparado sin exigir servidor (docs/API_FUTURA.md). |

## OWASP MASVS (resumen de cobertura)

- **STORAGE**: SQLCipher; clave en Keystore; sin datos sensibles en logs (no hay `console.log` de datos); `allowBackup=false`; exportaciones temporales en caché y limpiadas al iniciar; CSV desidentificados.
- **CRYPTO**: primitivas estándar (AES-GCM, PBKDF2-SHA256) de bibliotecas auditadas; aleatoriedad del SO (`expo-crypto`); sin claves en el código.
- **AUTH**: autenticación local, bloqueo progresivo, mensajes genéricos, cambio obligatorio de contraseña temporal, bloqueo por inactividad (también al volver de segundo plano), control de acceso en la capa de servicios.
- **NETWORK**: la app no requiere red; las únicas solicitudes posibles son teselas de mapa (opt-in, HTTPS) y la sincronización futura (HTTPS obligatorio).
- **PLATFORM**: permisos mínimos (cámara, micrófono, contactos y superposición bloqueados en el manifiesto); permiso de ubicación solo al iniciar un recorrido; `FLAG_SECURE` configurable.
- **CODE/RESILIENCE**: consultas parametrizadas; validación Zod + validación de negocio en servicios; TypeScript estricto; ESLint (React Compiler) sin errores.

## LOPDP (Ecuador)

Minimización (campos opcionales deshabilitados por defecto), consentimiento de contacto independiente y versionado, finalidad limitada, aviso de privacidad en la app, seguridad técnica, auditoría de accesos a fichas, conservación limitada de rutas GPS con depuración, derechos de rectificación con historial de versiones, y bloqueo del tratamiento real hasta registrar autorización del responsable.
