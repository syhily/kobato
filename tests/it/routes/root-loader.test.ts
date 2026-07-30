import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeSession } from '#/_helpers/session'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const db = getTestDb()
const session = makeSession({ csrfToken: 'test-csrf-token' })

// The settings snapshot is REAL here: no getters/hydrate doubles. The
// empty setting table hydrates to `null` — the pre-install state — and
// the root loader surfaces it as `blogSettings: null`.

vi.mock('@/client/api/query-client', () => ({
  makeQueryClient: vi.fn(() => ({})),
}))

vi.mock('@tanstack/react-query', () => ({
  dehydrate: vi.fn(() => ({})),
}))

vi.mock('@/server/render/warmup/manifest', () => ({
  getCriticalChunksForPathname: vi.fn(() => null),
  getWarmupManifest: vi.fn(() => null),
}))

const { loader } = await import('@/root')

describe('root loader', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    // Restore the pre-install state so the real hydrate re-reads the
    // (empty) setting table instead of the worker's seeded bundle.
    resetBlogSettingsForTests()
  })

  it('hydrates to null on an empty setting table — the pre-install state', async () => {
    await expect(hydrateBlogSettings(db)).resolves.toBeNull()
    expect(getBlogSettingsBundleSync()).toBeNull()
  })

  it('returns cspNonce so the Layout can apply it to inline scripts', async () => {
    const args = makeLoaderArgs({
      request: new Request('http://localhost/'),
      session,
      user: undefined,
      clientAddress: '127.0.0.1',
      cspNonce: 'test-nonce-abc123',
    })

    const result = await loader(args)

    expect(result).toMatchObject({
      cspNonce: 'test-nonce-abc123',
      // No hydrated settings pre-install — the loader passes null through
      // instead of fabricating a bundle.
      blogSettings: null,
    })
  })
})
