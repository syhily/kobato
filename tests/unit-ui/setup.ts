// Worker setup for unit-ui (React component tests).
//
// Mirrors `tests/unit/setup.ts`'s concern (settings slot reset) but skips
// the DB/Redis env wiring — editor component tests mock at the oRPC client
// boundary and never touch server connections. `#/_helpers/env` is still
// imported so that any transitive `.server.ts` import doesn't crash on
// missing `process.env` at module-load time.

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import '#/_helpers/env'

BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))

// Auto-cleanup the DOM between tests so each case starts from a clean root,
// and reset the settings snapshot so a mutated bundle can't leak across.
afterEach(() => {
  cleanup()
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
})
