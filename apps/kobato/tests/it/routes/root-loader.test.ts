import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { resetBlogSettingsForTests } from '@tests/utils/blog-settings.ts'
import { makeLoaderArgs } from '@tests/utils/context.ts'
import { clearAllTables, getTestDb } from '@tests/utils/integration-db.ts'
import { makeSession } from '@tests/utils/session.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const session = makeSession({ csrfToken: 'test-csrf-token' })

vi.mock('@kobato/web-client/api/query-client.ts', () => ({
  makeQueryClient: vi.fn(() => ({})),
}))

vi.mock('@tanstack/react-query', () => ({
  dehydrate: vi.fn(() => ({})),
}))

vi.mock('@kobato/server/render/warmup/manifest.ts', () => ({
  getCriticalChunksForPathname: vi.fn(() => null),
  getWarmupManifest: vi.fn(() => null),
}))

const traceConfig = vi.hoisted(() => ({ current: { rum: null as unknown } }))
vi.mock('@kobato/server/infra/trace/config.ts', () => ({
  activeFrontendRum: () => traceConfig.current.rum,
}))

const { loader } = await import('@/root.tsx')

describe('root loader', () => {
  beforeEach(async () => {
    await clearAllTables(db)
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

  it('returns only the narrow browser bootstrap when frontend RUM is active — in dev and production builds', async () => {
    const makeBootstrap = (environment: 'development' | 'production') => ({
      applicationId: 'kobato-dev',
      service: 'kobato',
      environment,
      sessionSampleRate: 100,
      clientIdentity: 'anonymous' as const,
    })
    const args = () =>
      makeLoaderArgs({
        request: new Request('http://localhost/'),
        session,
        user: undefined,
        clientAddress: '127.0.0.1',
        cspNonce: 'test-nonce-abc123',
      })

    for (const environment of ['development', 'production'] as const) {
      const bootstrap = makeBootstrap(environment)
      traceConfig.current = { rum: bootstrap }

      const result = await loader(args())

      expect(result).toHaveProperty('rum', bootstrap)
      expect(result.rum?.environment).toBe(environment)
      expect(JSON.stringify(result.rum)).not.toContain('serverAuthorizationHeader')
      expect(JSON.stringify(result.rum)).not.toContain('authorizationHeader')
    }
  })
})
