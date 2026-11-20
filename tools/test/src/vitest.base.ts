// Spread into every project config's `test` block — file-based projects do
// not inherit the root config's test options.
export const vitestTestBase = {
  globals: false,
  silent: 'passed-only',
  environment: 'node',
  pool: 'threads',
  maxWorkers: 4,
  isolate: false,
  testTimeout: 10_000,
} as const
