  # Vitalis Pifo · app móvil del piloto de campo

Registro **offline** de pacientes y signos vitales para la campaña médica comunitaria de Pifo, con **recorrido GPS del equipo** tipo app deportiva, métricas académicas para comparar el registro digital con papel/Excel, y **respaldo cifrado**. Prioriza Android (APK instalable) y es compatible a nivel de arquitectura con iOS.

> Fuente de requisitos: `../Documentacion/Vitalis_Pifo_Especificacion_Movil_GPS.pdf` (v0.2).
> Decisiones técnicas: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) · Manual: [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) · Informe: [docs/INFORME_FINAL.md](docs/INFORME_FINAL.md)

## Stack

| Capa | Tecnología |
|---|---|
| App | Expo SDK 58 · React Native 0.88 · React 19 · TypeScript 6 · Expo Router (pestañas + pila) |
| Formularios | React Hook Form + Zod |
| Datos | `expo-sqlite` compilado con **SQLCipher** · migraciones versionadas (`PRAGMA user_version`) |
| Claves | `expo-secure-store` (Android Keystore / iOS Keychain) · `expo-crypto` |
| Criptografía | PBKDF2-SHA256 (credenciales y respaldos) y AES-256-GCM (respaldos) con `@noble/hashes` / `@noble/ciphers` (auditadas) |
| GPS | `expo-location` (primer plano) + `expo-task-manager` (segundo plano con servicio en primer plano y notificación) |
| Mapa | Trazado propio Web Mercator + `react-native-svg`; teselas XYZ opcionales (OSM) solo si se autorizan |
| Exportación | `expo-file-system` + `expo-sharing` (manual, sin subida automática) · `expo-document-picker` para restaurar |
| Pruebas | Jest + `sql.js` (SQLite real en Node con el mismo esquema y migraciones) |

## Requisitos

- Node.js 20+ (probado con 24.18) y npm 11.
- Para compilar Android: **JDK 17** y **Android SDK** (`ANDROID_HOME`). Gradle descarga NDK/CMake/build-tools en la primera compilación (requiere internet esa vez).
- Expo Go **no** sirve para validar SQLCipher ni la captura en segundo plano: use la compilación nativa.

## Instalación

```bash
cd vitalis-pifo-mobile
npm install              # .npmrc usa legacy-peer-deps (peer opcional de react-dom para web)
npm run verify           # tsc + eslint + jest
```

## Ejecutar en desarrollo (dispositivo o emulador Android)

```bash
npx expo run:android     # compila el cliente de desarrollo nativo e instala
npm start                # servidor Metro para el cliente de desarrollo
```

## Generar la APK de release

```bash
npm run build:apk                                 # ABIs arm64-v8a y armeabi-v7a (teléfonos reales)
npm run build:apk -- --abis=arm64-v8a,armeabi-v7a,x86_64   # incluye emulador x86_64
```

El script (`scripts/build-apk.js`) ejecuta `expo prebuild` si falta `android/`, fija `local.properties` y corre `gradlew assembleRelease`. Si `JAVA_HOME`/`ANDROID_HOME` no están definidos usa `~/android-toolchain/{jdk17,sdk}`. Resultado: `dist-apk/vitalis-pifo-<versión>.apk`.

**Windows: rutas largas.** La compilación C++ (CMake/ninja) falla si la ruta del proyecto es larga ("Filename longer than 260 characters"). Copie o clone el proyecto en una ruta corta (p. ej. `C:\vp`) antes de `npm run build:apk`. No use `subst`: el autolinking de Expo no funciona desde la raíz de una unidad. Además, con `LongPathsEnabled=1`, use `ninja` ≥ 1.12: instale `cmake;3.31.6` con `sdkmanager` y copie su `ninja.exe` sobre `sdk\cmake\3.22.1\bin\ninja.exe` (la 1.10 no admite rutas largas).

**Firma.** Sin configuración adicional la APK se firma con la clave de depuración (instalable para el piloto, no apta para tiendas). Para firmar con una clave propia:

```bash
keytool -genkeypair -v -keystore android/vitalis-release.keystore -alias vitalis -keyalg RSA -keysize 4096 -validity 3650
# android/keystore.properties (NO versionar):
storeFile=vitalis-release.keystore
storePassword=...
keyAlias=vitalis
keyPassword=...
```

El config plugin `plugins/withReleaseSigning.js` lo detecta automáticamente en el siguiente `prebuild`/compilación. Instalar en un teléfono: `adb install -r dist-apk/vitalis-pifo-0.2.0.apk` o copiar el archivo y permitir "instalar apps desconocidas".

## Scripts

| Script | Qué hace |
|---|---|
| `npm run verify` | Tipos (`tsc`), lint (`eslint`) y pruebas (`jest`) |
| `npm test` | 54 pruebas: dominio, repositorios, servicios, GPS, seguridad, respaldo, exportación |
| `npm run typecheck` / `npm run lint` | Por separado |
| `npm run build:apk` | APK de release |
| `npm run prebuild` | Regenera `android/` desde `app.json` + plugins (no editar `android/` a mano) |

## Estructura

```
src/
  app/                    Rutas (Expo Router)
    _layout.tsx           Arranque, rutas protegidas por sesión, bloqueo por inactividad, tarea GPS global
    login.tsx · configuracion-inicial.tsx
    (app)/(tabs)/         Inicio · Pacientes · Recorrido · Estadísticas · Ajustes
    (app)/atencion/       nueva, detalle, corrección
    (app)/paciente/       nuevo, ficha, edición
    (app)/rutas/          detalle e historial de recorridos
    (app)/evaluacion/     matriz, registro papel/Excel, encuesta, verificación
    (app)/…               campañas, usuarios, auditoría, seguridad, respaldo, privacidad, config
  db/                     Interfaz Db + mutex de serialización, SQLCipher, migraciones
  domain/                 Lógica pura: IMC, rangos vitales, Haversine/Mercator, filtro GPS, duplicados, estadística
  schemas/                Validación Zod de formularios
  repositories/           SQL parametrizado por entidad
  services/               Reglas de negocio + control de acceso + auditoría (auth, pacientes, atenciones,
                          campañas, rutas, gps, gps-task, evaluación, estadísticas, exportación, respaldo,
                          seguridad, datos sintéticos)
  security/               Permisos por rol, credenciales, cifrado de respaldos, almacén de claves
  sync/                   Preparación para API REST futura (lotes por sync_estado; sin envío automático)
  platform/               Runtime inyectable (UUID/aleatorio/reloj) y archivos
  state/ · components/ · theme/
tests/                    Pruebas Jest (sql.js)
docs/                     Arquitectura, manual de usuario, informe final, API futura
plugins/                  Config plugins propios
```

## Seguridad en una línea por control

Base cifrada con clave aleatoria de 256 bits en Keystore · autenticación local con PBKDF2 y bloqueo progresivo · roles con mínimo privilegio aplicados en servicios · bloqueo por inactividad · auditoría sin datos sensibles · consultas parametrizadas · anulación lógica (sin borrado físico accidental) · `allowBackup=false` · bloqueo de capturas de pantalla · exportaciones académicas desidentificadas y con protección contra inyección de fórmulas CSV · respaldos AES-256-GCM con clave custodiada · modo de **datos reales bloqueado** hasta que todos los controles se verifiquen y se registre la autorización del consultorio.
