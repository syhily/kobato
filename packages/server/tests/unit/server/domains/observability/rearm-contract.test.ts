import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('server boot — observability sync runs after settings hydration', () => {
  it('hydrates settings before syncing the runtime', () => {
    const source = readFileSync(join(process.cwd(), 'apps/kobato/src/server.ts'), 'utf-8')

    const hydrateIndex = source.indexOf('await hydrateBlogSettings(getDb())')
    const syncIndex = source.indexOf('await syncObservabilityRuntime()')

    expect(hydrateIndex).toBeGreaterThan(-1)
    expect(syncIndex).toBeGreaterThan(-1)
    expect(hydrateIndex).toBeLessThan(syncIndex)
    expect(source).toContain(
      "import { hydrateBlogSettings, refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'",
    )
  })
})
