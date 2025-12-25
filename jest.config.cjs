module.exports = {
  testEnvironment: 'node',
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      diagnostics: { warnOnly: true },
      tsconfig: {
        noImplicitAny: false,
        strictNullChecks: false,
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@manager/(.*)$': '<rootDir>/src/manager/$1',
    '^@machine/(.*)$': '<rootDir>/src/machine/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 10000,
};
