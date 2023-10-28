module.exports = {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  testEnvironment: "node",
  testTimeout: 5000,
  rootDir: ".",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  modulePathIgnorePatterns: [".eslintrc.js", "coverage", "docker", "node_modules"],
  // globalSetup: "./test/setup-global.ts",
  setupFilesAfterEnv: ["jest-27-expect-message"],
  collectCoverageFrom: ["./src/**/*.ts"],
  coveragePathIgnorePatterns: ["node_modules", "test"],
  coverageReporters: ["clover", "json", "lcov", "text", "@lcov-viewer/istanbul-report"],
};
