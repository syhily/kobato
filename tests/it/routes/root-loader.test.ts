import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeSession } from '#/_helpers/session'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const db = getTestDb()
const session = makeSession({ csrfToken: 'test-csrf-token' })

// Real settings snapshot: the empty table hydrates to null (the pre-install state).

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

const traceConfig = vi.hoisted(() => ({ current: { rum: null as unknown } }))
vi.mock('@/server/infra/trace/config', () => ({
  activeFrontendRum: () => traceConfig.current.rum,
}))

const { loader } = await import('@/root')

describe('root loader', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    // Restore the pre-install state: hydrate must re-read the empty table, not the seeded bundle.
    resetBlogSettingsForTests()
    traceConfig.current = { rum: null }
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
      // Pre-install: pass null through, don't fabricate a bundle.
      blogSettings: null,
    })
  })

  it('omits the RUM bootstrap entirely when frontend RUM is disabled', async () => {
    const args = makeLoaderArgs({
      request: new Request('http://localhost/'),
      session,
      user: undefined,
      clientAddress: '127.0.0.1',
      cspNonce: 'test-nonce-abc123',
    })

    const result = await loader(args)

    expect(result).not.toHaveProperty('rum')
    expect(JSON.stringify(result)).not.toContain('clientToken')
    expect(JSON.stringify(result)).not.toContain('serverAuthorizationHeader')
  })

  it('returns only the narrow browser bootstrap when frontend RUM is active', async () => {
    const bootstrap = {
      site: 'http://127.0.0.1:5080',
      organization: 'default',
      applicationId: 'kobato-dev',
      clientToken: 'rum-token',
      service: 'kobato',
      environment: 'development',
      sessionSampleRate: 100,
    }
    traceConfig.current = { rum: bootstrap }

    const args = makeLoaderArgs({
      request: new Request('http://localhost/'),
      session,
      user: undefined,
      clientAddress: '127.0.0.1',
      cspNonce: 'test-nonce-abc123',
    })

    const result = await loader(args)

    expect(result).toHaveProperty('rum', bootstrap)
    expect(JSON.stringify(result.rum)).not.toContain('serverAuthorizationHeader')
    expect(JSON.stringify(result.rum)).not.toContain('authorizationHeader')
  })
})
