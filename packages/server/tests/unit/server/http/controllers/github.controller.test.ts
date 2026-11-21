import { githubRouter } from '@kobato/server/http/controllers/github.controller'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { __setDnsLookupForTests } from '@kobato/server/infra/safe-fetch'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { installFetch, jsonResponse } from '@kobato/test/fetch'
import { beforeEach, describe, expect, it } from 'vitest'

const dnsSeam = async () => [{ address: '203.0.113.10', family: 4 }]
__setDnsLookupForTests(dnsSeam)

const { RPCHandler } = await import('@orpc/server/fetch')
const handler = new RPCHandler(githubRouter)

async function call(path: string, input: unknown) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx() },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

describe('github controller', () => {
  const mockFetch = installFetch()

  beforeEach(() => {
    mockFetch.reset()
    __resetRateLimitsForTests()
    globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  })

  it('avatar returns the data URL produced by the domain service', async () => {
    mockFetch.enqueue(
      /avatars\.githubusercontent\.com/,
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const response = await call('/avatar', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ avatar: string }>(response)
    expect(body.avatar).toBe('data:image/png;base64,iVBORw==')
  })

  it('avatar passes through the empty-string fallback for a failed upstream', async () => {
    mockFetch.enqueue(/avatars\.githubusercontent\.com/, new Response('not found', { status: 404 }))

    const response = await call('/avatar', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ avatar: string }>(response)
    expect(body.avatar).toBe('')
  })

  it('release returns parsed release info on success', async () => {
    mockFetch.enqueue(
      /api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/latest/,
      jsonResponse({
        tag_name: 'v1.2.3',
        html_url: 'https://github.com/syhily/kobato/releases/tag/v1.2.3',
        name: 'Release 1.2.3',
        published_at: '2024-01-01T00:00:00Z',
      }),
    )

    const response = await call('/release', {})
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{
      tagName: string
      htmlUrl: string
      name: string
      publishedAt: string
    }>(response)
    expect(body.tagName).toBe('v1.2.3')
    expect(body.htmlUrl).toBe('https://github.com/syhily/kobato/releases/tag/v1.2.3')
    expect(body.name).toBe('Release 1.2.3')
    expect(body.publishedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('release throws when upstream fails', async () => {
    mockFetch.enqueue(
      /api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/latest/,
      new Response('not found', { status: 404 }),
    )

    const response = await call('/release', {})
    expect(response.status).toBe(500)
  })
})
