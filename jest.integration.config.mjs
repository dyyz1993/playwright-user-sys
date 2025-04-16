export default {
  testEnvironment: 'node',
  testMatch: ['**/src/tests/integration/**/*.test.ts'],
  verbose: true,
  forceExit: true,
  transform: {
    '^.+\\.(ts|tsx)$': 'babel-jest'
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
