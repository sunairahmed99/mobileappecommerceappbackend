export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: ['<rootDir>/test/**/*.test.js'],
    setupFiles: ['<rootDir>/test/setup.cjs'],
    testTimeout: 15000,
    coverageProvider: 'v8',
    collectCoverageFrom: ['Controllers/**/*.js', 'Routes/**/*.js', 'services/**/*.js', 'middleware/**/*.js', 'config/jwt.js', 'Models/**/*.js', 'app.js', 'socket.js'],
    coverageReporters: ['text-summary', 'json-summary', 'html', 'lcov'],
};
