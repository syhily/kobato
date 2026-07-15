import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeLoaderArgs } from '#/_helpers/context'
import { makeSession } from '#/_helpers/session'
import { cspNonceContext } from '@/server/domains/auth/context'

const session = makeSession({ csrfToken: 'test-csrf-token' })

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => null),
}))
vi.mock('@/server/domains/settings/services/hydrate', () => ({
  hydrateBlogSettings: vi.fn(() => Promise.resolve()),
}))

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cspNonce so the Layout can apply it to inline scripts', async () => {
    const args = makeLoaderArgs({
      request: new Request('http://localhost/'),
      session,
      user: undefined,
      clientAddress: '127.0.0.1',
    })
    args.context.set(cspNonceContext, 'test-nonce-abc123')

    const result = await loader(args)

    expect(result).toMatchObject({
      cspNonce: 'test-nonce-abc123',
    })
  })
})
