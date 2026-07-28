// Vitest worker setup for integration tests. Creates a fresh SQLite database
// FILE per worker before any test file runs — no server, no docker.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach } from 'vitest'

// The per-worker database path MUST land before any import that could
// evaluate `@/server/infra/config` — the config module freezes
// `storage.database` at first load, so a late assignment would be
// invisible to `db-lifecycle`'s `openDatabase(resolveDatabasePath())`.
const workerDir = mkdtempSync(join(tmpdir(), 'kobato-worker-'))
process.env.storage__database = join(workerDir, 'worker.db')

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
// Provide the env defaults `@/server/infra/config` requires at
// module-load time (skips the already-assigned storage__database).
import '#/_helpers/env'

// Migrate the worker file up-front so every handle opened on it (the
// lifecycle global AND per-file test handles) sees the full schema.
const { migrateWorkerDatabase, closeAllTestDatabases } = await import('#/_helpers/integration-db')
migrateWorkerDatabase(process.env.storage__database)

afterAll(() => {
  closeAllTestDatabases()
})

// Seed the in-process settings snapshot once per worker.
setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot after every test to prevent isolation leaks.
afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
