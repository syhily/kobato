/**
 * Test files that spin up the real DuckDB native engine, pinned by
 * `apps/kobato/tests/arch/duckdb-project-files.test.ts`. They run in the dedicated `duckdb`
 * project (`apps/kobato/tests/vitest.duckdb.config.ts`): sequential files, one fresh fork each, so a
 * native crash stays contained to its own worker. Paths are relative to the repository root.
 */
export const DUCKDB_TEST_FILES: readonly string[] = [
  'apps/kobato/tests/it/routes/admin/dashboard.test.ts',
  'apps/kobato/tests/it/routes/post-analytics-parity.test.ts',
  'packages/server/tests/it/server/domains/analytics/analytics-coverage.test.ts',
  'packages/server/tests/it/server/domains/analytics/blob-migration.test.ts',
  'packages/server/tests/it/server/domains/analytics/counters.test.ts',
  'packages/server/tests/it/server/domains/analytics/metric-env.test.ts',
  'packages/server/tests/it/server/domains/analytics/track.test.ts',
  'packages/server/tests/it/server/domains/backup/services/backup-restore.test.ts',
  'packages/server/tests/it/server/http/admin-api.test.ts',
  'packages/server/tests/it/server/http/controllers/analytics.test.ts',
  'packages/server/tests/it/server/http/resources/analytics-env.test.ts',
  'packages/server/tests/it/server/http/resources/analytics-events.test.ts',
  'packages/server/tests/it/server/infra/analytics/duckdb.test.ts',
  'packages/server/tests/it/server/infra/db/maintenance.test.ts',
  'packages/server/tests/unit/server/bootstrap/analytics-lifecycle.test.ts',
  'packages/server/tests/unit/server/domains/analytics/batcher.test.ts',
  'packages/server/tests/unit/server/domains/analytics/device-env.test.ts',
  'packages/server/tests/unit/server/domains/analytics/services/batcher.test.ts',
  'packages/server/tests/unit/server/domains/analytics/services/env-beacon.test.ts',
]

/** The subset living under one tests tree (`apps/kobato/tests` or `packages/server/tests`), relative to that tree, for that project's `exclude`. */
export function duckdbTestFilesUnder(testsRoot: 'apps/kobato/tests' | 'packages/server/tests'): string[] {
  const prefix = `${testsRoot}/`
  return DUCKDB_TEST_FILES.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length))
}
