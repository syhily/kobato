export const DUCKDB_TEST_FILES: readonly string[] = [
  'apps/kobato/tests/it/routes/admin/dashboard.test.ts',
  'apps/kobato/tests/it/routes/post-analytics-parity.test.ts',
  'packages/db/tests/it/duckdb/blob-migration.test.ts',
  'packages/db/tests/it/duckdb/database.test.ts',
  'packages/db/tests/it/duckdb/maintenance.test.ts',
  'packages/db/tests/it/duckdb/queries/analytics-coverage.test.ts',
  'packages/db/tests/it/duckdb/queries/counters.test.ts',
  'packages/db/tests/it/duckdb/queries/metric-env.test.ts',
  'packages/db/tests/unit/duckdb/device-env.test.ts',
  'packages/server/tests/it/server/domains/analytics/track.test.ts',
  'packages/server/tests/it/server/domains/backup/services/backup-restore.test.ts',
  'packages/server/tests/it/server/http/admin-api.test.ts',
  'packages/server/tests/it/server/http/controllers/analytics.test.ts',
  'packages/server/tests/it/server/http/resources/analytics-env.test.ts',
  'packages/server/tests/it/server/http/resources/analytics-events.test.ts',
  'packages/server/tests/unit/server/bootstrap/analytics-lifecycle.test.ts',
  'packages/server/tests/unit/server/domains/analytics/batcher.test.ts',
  'packages/server/tests/unit/server/domains/analytics/services/batcher.test.ts',
  'packages/server/tests/unit/server/domains/analytics/services/env-beacon.test.ts',
]

export function duckdbTestFilesUnder(
  testsRoot: 'apps/kobato/tests' | 'packages/db/tests' | 'packages/server/tests',
): string[] {
  const prefix = `${testsRoot}/`
  return DUCKDB_TEST_FILES.filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .map((file) => file.replace(/^(it|unit)\//, ''))
}
