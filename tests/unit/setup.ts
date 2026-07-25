// Vitest worker setup for unit tests. No DB — just env vars and
// the settings snapshot slot so tests that import server modules can resolve.
//
// Also registers @testing-library/jest-dom matchers + auto-cleanup for
// tests that use @testing-library/react (via per-file `@vitest-environment
// happy-dom`). These are no-ops for Node-environment tests.

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import '#/_helpers/env'

BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))

// Auto-reset the snapshot + DOM after every test to prevent isolation leaks.
afterEach(() => {
  cleanup()
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
})
