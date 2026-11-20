import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { __resetFrontendGateForTests, activateFrontendGate } from '@kobato/server/infra/trace/frontend-gate.ts'
import { __setWarmupAssetsDirForTests } from '@kobato/server/render/warmup/manifest.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { resetBlogSettingsForTests } from '@tests/utils/blog-settings.ts'
import { makeLoaderArgs } from '@tests/utils/context.ts'
import { clearAllTables, getTestDb } from '@tests/utils/integration-db.ts'
import { makeSession } from '@tests/utils/session.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()
const session = makeSession({ csrfToken: 'test-csrf-token' })

// No warmup assets are staged, so the real manifest resolvers return null.
const emptyAssetsDir = mkdtempSync(join(tmpdir(), 'kobato-root-loader-'))
__setWarmupAssetsDirForTests(emptyAssetsDir)

const { loader } = await import('@/root.tsx')

describe('root loader', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    resetBlogSettingsForTests()
    __resetFrontendGateForTests()
  })

  afterAll(() => {
    __setWarmupAssetsDirForTests(null)
    __resetFrontendGateForTests()
    rmSync(emptyAssetsDir, { recursive: true, force: true })
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
    const args = () =>
      makeLoaderArgs({
        request: new Request('http://localhost/'),
        session,
        user: undefined,
        clientAddress: '127.0.0.1',
        cspNonce: 'test-nonce-abc123',
      })

    for (const environment of ['development', 'production'] as const) {
      const bootstrap = {
        applicationId: 'kobato-dev',
        service: 'kobato',
        environment,
        sessionSampleRate: 100,
        clientIdentity: 'anonymous' as const,
      }
      activateFrontendGate({}, bootstrap, {
        endpoint: 'http://127.0.0.1:5080',
        organization: 'default',
        clientToken: 'rum-client-token',
        clientIdentity: 'anonymous',
      })

      const result = await loader(args())

      expect(result).toHaveProperty('rum', bootstrap)
      expect(result.rum?.environment).toBe(environment)
      expect(JSON.stringify(result.rum)).not.toContain('serverAuthorizationHeader')
      expect(JSON.stringify(result.rum)).not.toContain('authorizationHeader')
    }
  })
})
