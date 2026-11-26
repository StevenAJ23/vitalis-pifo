#!/usr/bin/env node
/**
 * Compila la APK de release (SQLCipher + GPS en segundo plano) con el Android SDK/JDK locales.
 * Uso: npm run build:apk  [-- --abis=arm64-v8a,armeabi-v7a,x86_64]
 * Requiere JAVA_HOME (JDK 17) y ANDROID_HOME. Si no están definidos, intenta ~/android-toolchain/{jdk17,sdk}.
 * Firma: si existe android/keystore.properties se usa ese keystore; si no, se firma con la clave de depuración
 * (APK instalable para el piloto, NO apta para distribución en tiendas).
 */
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const esWin = process.platform === 'win32';
const toolchain = path.join(os.homedir(), 'android-toolchain');
const env = { ...process.env };
if (!env.JAVA_HOME && fs.existsSync(path.join(toolchain, 'jdk17'))) env.JAVA_HOME = path.join(toolchain, 'jdk17');
if (!env.ANDROID_HOME && fs.existsSync(path.join(toolchain, 'sdk'))) env.ANDROID_HOME = path.join(toolchain, 'sdk');
if (!env.JAVA_HOME || !env.ANDROID_HOME) {
  console.error('Defina JAVA_HOME (JDK 17) y ANDROID_HOME antes de compilar.');
  process.exit(1);
}
// En Windows la variable se llama "Path": se reutiliza la clave existente para no duplicarla.
const clavePath = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
env[clavePath] = `${path.join(env.JAVA_HOME, 'bin')}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${env[clavePath] ?? ''}`;

const abisArg = process.argv.find((a) => a.startsWith('--abis='));
const abis = abisArg ? abisArg.split('=')[1] : 'arm64-v8a,armeabi-v7a';

if (!fs.existsSync(path.join(raiz, 'android'))) {
  console.log('> expo prebuild --platform android');
  execSync('npx expo prebuild --platform android --no-install', { cwd: raiz, stdio: 'inherit', env: { ...env, CI: '1' } });
}
fs.writeFileSync(path.join(raiz, 'android', 'local.properties'), `sdk.dir=${env.ANDROID_HOME.replace(/\\/g, '\\\\')}\n`);

const gradlew = path.join(raiz, 'android', esWin ? 'gradlew.bat' : 'gradlew');
const r = spawnSync(gradlew, ['assembleRelease', `-PreactNativeArchitectures=${abis}`, '--no-daemon'], {
  cwd: path.join(raiz, 'android'),
  stdio: 'inherit',
  env,
  shell: esWin,
});
if (r.status !== 0) process.exit(r.status ?? 1);

const apk = path.join(raiz, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const destino = path.join(raiz, 'dist-apk');
fs.mkdirSync(destino, { recursive: true });
const final = path.join(destino, `vitalis-pifo-${require(path.join(raiz, 'package.json')).version}.apk`);
fs.copyFileSync(apk, final);
console.log(`\nAPK lista: ${final} (${(fs.statSync(final).size / 1024 / 1024).toFixed(1)} MB)`);
