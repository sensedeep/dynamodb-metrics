/*
   Jest configuration
 */
module.exports = {
    "coveragePathIgnorePatterns": [
        "node_modules",
        "test/utils"
    ],
    coverageDirectory: "coverage",
    globals: {
      'ts-jest': {
          useESM: true
      },
      __DYNAMODB__: null,
    },
    roots: [
        "<rootDir>/src",
        "<rootDir>/test"
    ],
    testMatch: [
        "**/*.[jt]s",
        "!**/src/*.[jt]s",
        "!**/utils/setup.[jt]s",
        "!**/utils/init.[jt]s",
        "!**/utils/table.[jt]s",
        "!**/utils/teardown.[jt]s",
        "!**/helpers.[jt]s",
        "!**/schemas/*",
    ],
    globalSetup: '<rootDir>/test/utils/setup.ts',
    globalTeardown: '<rootDir>/test/utils/teardown.ts',
    testEnvironment: "node",
    transform: {
        '^.+\\.(js|ts)$': 'ts-jest'
    },
    verbose: undefined
    // setupFiles: ['<rootDir>/test/utils/helpers.ts'],
};
