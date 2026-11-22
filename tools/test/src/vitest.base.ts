export const vitestTestBase = {
  globals: false,
  silent: 'passed-only',
  environment: 'node',
  pool: 'threads',
  maxWorkers: 4,
  isolate: true,
  testTimeout: Number(process.env.VITEST_TEST_TIMEOUT ?? 10_000),
  unstubGlobals: true,
  unstubEnvs: true,
} as const
