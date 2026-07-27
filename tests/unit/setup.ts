// Vitest worker setup for unit tests. No DB — just env vars and
// the settings snapshot slot so tests that import server modules can resolve.
//
// Also registers @testing-library/jest-dom matchers + auto-cleanup for
// tests that use @testing-library/react (via per-file `@vitest-environment
// happy-dom`). These are no-ops for Node-environment tests.

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import '#/_helpers/env'

setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

// Auto-reset the snapshot + DOM after every test to prevent isolation leaks.
afterEach(() => {
  cleanup()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})
