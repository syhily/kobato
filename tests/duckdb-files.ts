/**
 * Test files that spin up the real DuckDB native engine, pinned by
 * `tests/unit/arch/duckdb-project-files.test.ts`. They run in the dedicated `duckdb`
 * project (`tests/vitest.duckdb.config.ts`): sequential files, one fresh fork each, so a
 * native crash stays contained to its own worker. Paths are relative to `tests/`.
 */
export const DUCKDB_TEST_FILES: readonly string[] = [
  'it/routes/admin/dashboard.test.ts',
  'it/routes/post-analytics-parity.test.ts',
  'it/server/domains/analytics/analytics-coverage.test.ts',
  'it/server/domains/analytics/blob-migration.test.ts',
  'it/server/domains/analytics/counters.test.ts',
  'it/server/domains/analytics/metric-env.test.ts',
  'it/server/domains/analytics/track.test.ts',
  'it/server/domains/backup/services/backup-restore.test.ts',
  'it/server/http/admin-api.test.ts',
  'it/server/http/controllers/analytics.test.ts',
  'it/server/http/resources/analytics-env.test.ts',
  'it/server/http/resources/analytics-events.test.ts',
  'it/server/infra/analytics/duckdb.test.ts',
  'it/server/infra/db/maintenance.test.ts',
  'unit/server/bootstrap/analytics-lifecycle.test.ts',
  'unit/server/domains/analytics/batcher.test.ts',
  'unit/server/domains/analytics/device-env.test.ts',
  'unit/server/domains/analytics/services/batcher.test.ts',
  'unit/server/domains/analytics/services/env-beacon.test.ts',
]

/** The subset living under a `tests/<root>/` project root, for that project's `exclude`. */
export function duckdbTestFilesUnder(root: 'it' | 'unit'): string[] {
  const prefix = `${root}/`
  return DUCKDB_TEST_FILES.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length))
}
