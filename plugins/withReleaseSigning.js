/**
 * Config plugin: firma de release con un keystore propio si existe android/keystore.properties
 * (storeFile, storePassword, keyAlias, keyPassword). Sin ese archivo se mantiene la firma de depuración
 * de la plantilla (APK instalable para el piloto). El archivo y el keystore NO se versionan (.gitignore).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARCA = '// vitalis-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes(MARCA)) return cfg;
    const carga = `${MARCA}
def vitalisKeystoreProps = new Properties()
def vitalisKeystoreFile = rootProject.file('keystore.properties')
if (vitalisKeystoreFile.exists()) { vitalisKeystoreFile.withInputStream { vitalisKeystoreProps.load(it) } }
`;
    g = g.replace(/android\s*\{/, (m) => `${carga}\n${m}`);
    g = g.replace(/signingConfigs\s*\{/, (m) => `${m}
        release {
            if (vitalisKeystoreFile.exists()) {
                storeFile rootProject.file(vitalisKeystoreProps['storeFile'])
                storePassword vitalisKeystoreProps['storePassword']
                keyAlias vitalisKeystoreProps['keyAlias']
                keyPassword vitalisKeystoreProps['keyPassword']
            }
        }`);
    g = g.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig vitalisKeystoreFile.exists() ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
