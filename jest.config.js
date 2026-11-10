/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // Coverage is measured on the logic and data layers; React hooks and
  // components are exercised by the browser smoke test instead.
  collectCoverageFrom: ["src/lib/**/*.ts", "src/data/**/*.ts", "!src/lib/use*.ts", "!src/lib/dbRows.ts", "!src/lib/scoreTypes.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary"],
  // A floor just under the measured level (74/60/78/76 in November 2026), so
  // coverage cannot quietly fall. Raise it as tests are added.
  coverageThreshold: { global: { statements: 70, branches: 56, functions: 75, lines: 73 } }
};
