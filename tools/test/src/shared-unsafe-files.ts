// Files still failing under the shared (isolate: false) projects — module or
// process state that leaks across files (env races, fetch stubs, module
// singletons). This is migration debt: fix the leak, delete the entry, and
// the file returns to the shared project automatically.
export const SHARED_UNSAFE_TEST_FILES: readonly string[] = [
  'packages/server/tests/unit/server/infra/config.test.ts',
  'packages/server/tests/unit/server/render/calendar/daily-quote.test.ts',
  'packages/server/tests/unit/server/infra/db/job-run-recorder.test.ts',
  'packages/server/tests/it/server/http/controllers/notifications.controller.test.ts',
  'packages/server/tests/it/server/domains/notifications/job-failure.test.ts',
  'packages/server/tests/unit/server/render/og/render.test.ts',
  'packages/server/tests/unit/server/http/errors.test.ts',
  'packages/server/tests/it/server/infra/cache/kv-maintenance.test.ts',
]
