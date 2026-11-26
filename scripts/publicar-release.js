#!/usr/bin/env node
/**
 * Publica la APK compilada como Release de GitHub (canal de actualizaciones de la app).
 * Uso: npm run publicar -- "Notas de la versión"
 * Requiere `gh` autenticado y haber ejecutado `npm run build:apk` (usa dist-apk/vitalis-pifo-<versión>.apk).
 * El repositorio se toma de app.json › expo.extra.actualizaciones.repo. El asset se llama siempre
 * "vitalis-pifo.apk" para que el enlace .../releases/latest/download/vitalis-pifo.apk no cambie.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(raiz, 'app.json'), 'utf8')).expo;
const version = app.version;
const repo = app.extra?.actualizaciones?.repo;
if (!repo) {
  console.error('Configure expo.extra.actualizaciones.repo en app.json');
  process.exit(1);
}
const origen = path.join(raiz, 'dist-apk', `vitalis-pifo-${version}.apk`);
if (!fs.existsSync(origen)) {
  console.error(`No existe ${origen}. Ejecute primero: npm run build:apk`);
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-rel-'));
const asset = path.join(tmp, 'vitalis-pifo.apk');
fs.copyFileSync(origen, asset);
const notas = process.argv.slice(2).join(' ') || `Vitalis Pifo ${version}`;
const tag = `v${version}`;
execFileSync('gh', ['release', 'create', tag, asset, '--repo', repo, '--title', `Vitalis Pifo ${version}`, '--notes', notas, '--latest'], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nPublicado ${tag}. Descarga: https://github.com/${repo}/releases/latest/download/vitalis-pifo.apk`);
