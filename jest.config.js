/**
 * Pruebas de dominio, repositorios y servicios sobre SQLite real (sql.js) en Node.
 * Se usa babel-jest con babel-preset-expo (misma transpilación que Metro) sin el runtime nativo de jest-expo,
 * porque el código probado no depende de módulos nativos (están detrás de interfaces inyectables).
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@noble)/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
