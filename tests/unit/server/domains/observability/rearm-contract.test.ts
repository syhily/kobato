import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `src/server.ts` is the accepted entry module (top-level await), so the boot
// ordering cannot be exercised by importing it. Pin the one line that makes HMR
// re-arm work: the settings snapshot is (re)hydrated immediately BEFORE the
// observability sync — `hydrateBlogSettings` is single-flight, so it is a no-op
// when the snapshot module survived the HMR cycle and a DB read when it did not.
describe('server boot — observability sync runs after settings hydration', () => {
  it('hydrates settings before syncing the runtime', () => {
    const source = readFileSync(join(process.cwd(), 'src/server.ts'), 'utf-8')

    const hydrateIndex = source.indexOf('await hydrateBlogSettings(getDb())')
    const syncIndex = source.indexOf('await syncObservabilityRuntime()')

    expect(hydrateIndex).toBeGreaterThan(-1)
    expect(syncIndex).toBeGreaterThan(-1)
    expect(hydrateIndex).toBeLessThan(syncIndex)
    expect(source).toContain(
      "import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/services/hydrate'",
    )
  })
})
