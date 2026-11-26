import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { isPublicMessageKey } from '@kobato/i18n/catalog-scope'
import { contentBootstrap } from '@kobato/server/http/controllers/public/content-bootstrap.controller'
import { orpcInputValidationInterceptor } from '@kobato/server/http/orpc-base'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { RPCHandler } from '@orpc/server/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/domains/settings/install-gate', () => ({
  getInstallState: vi.fn(async () => 'installed'),
}))
vi.mock('@kobato/server/infra/trace/config', () => ({
  activeFrontendRum: vi.fn(() => null),
}))

const handler = new RPCHandler<HandlerContext>(
  { public: { content: { bootstrap: contentBootstrap } } },
  {
    clientInterceptors: [orpcInputValidationInterceptor],
  },
)

async function bootstrap(
  ctx: HandlerContext,
  input: Record<string, unknown>,
): Promise<{ messages: Record<string, string>; locale: string }> {
  const result = await handler.handle(
    new Request(
      `http://localhost/rpc/public/content/bootstrap?data=${encodeURIComponent(JSON.stringify({ json: input }))}`,
      { method: 'GET' },
    ),
    { prefix: '/rpc', context: ctx },
  )
  if (!result.matched) {
    throw new Error('no route matched for /rpc/public/content/bootstrap')
  }
  expect(result.response.status).toBe(200)
  const payload = (await result.response.json()) as {
    json: { i18n: { messages: Record<string, string>; locale: string } }
  }
  return payload.json.i18n
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('contentBootstrap catalog scope', () => {
  it('serves the workspace catalog when the document asks for it (workspace keys + inkling labels)', async () => {
    const i18n = await bootstrap(makeAuthedCtx({ role: 'admin', csrfToken: 'c'.repeat(64) }), { scope: 'workspace' })
    expect(i18n.messages['admin.shell.nav.allPosts']).toBeTruthy()
    expect(i18n.messages['backup.error.notFound']).toBeTruthy()
  })

  it('serves the public catalog by default, even for a signed-in viewer', async () => {
    const i18n = await bootstrap(makeAuthedCtx({ role: 'admin', csrfToken: 'c'.repeat(64) }), {})
    expect(i18n.messages['admin.shell.nav.allPosts']).toBeUndefined()
    expect(i18n.messages['backup.error.notFound']).toBeUndefined()
    expect(i18n.messages['auth.signin.email']).toBeTruthy()
    for (const key of Object.keys(i18n.messages)) {
      expect(isPublicMessageKey(key), `public bootstrap carried the workspace key ${key}`).toBe(true)
    }
  })

  it('answers an anonymous public bootstrap with the public catalog', async () => {
    const i18n = await bootstrap(makePublicCtx({ csrfToken: 'c'.repeat(64) }), {})
    expect(i18n.messages['admin.shell.nav.allPosts']).toBeUndefined()
    expect(i18n.messages['auth.signin.email']).toBeTruthy()
  })
})
