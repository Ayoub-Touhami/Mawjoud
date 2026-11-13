/** Jest en mode module ES (NestJS 12 est publié en module ES). Base : mawjoud_test seulement. */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }] },
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
  // Ordre des fichiers réglable (ORDRE_TESTS), pour prouver qu'ils ne dépendent pas les uns des autres.
  testSequencer: '<rootDir>/test/sequenceur.mjs',
};