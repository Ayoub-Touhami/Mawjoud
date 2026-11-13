/** Jest en mode module ES (NestJS 12 est publié en module ES). Base : mawjoud_test seulement. */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }] },
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  testTimeout: 30000,
};