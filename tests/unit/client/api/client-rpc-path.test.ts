import { afterEach, describe, expect, it, vi } from 'vitest'

import { sanitizeResourceUrl } from '@/client/lib/rum-url-policy'

// The RUM sanitizer must match the URL shape the project's real oRPC client
// emits. @orpc/client's `toHttpPath` joins the procedure path with `/`, so
// `content.posts.bySlug` becomes `/rpc/content/posts/bySlug` — not the dotted
// form used in the router type. Capture the actual request URLs here instead
// of trusting a hand-written fixture.

const captured: string[] = []

const captureFetch = vi.fn(async (request: Request) => {
  captured.push(request.url)
  throw new Error('request captured')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  captured.length = 0
})

describe('project oRPC client HTTP path', () => {
  it('matches the sanitizer RPC template for top-level and nested procedures', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', captureFetch)

    const { orpc } = await import('@/client/api/client')
    const client = orpc as unknown as {
      content: {
        home: (input: unknown) => Promise<unknown>
        posts: { bySlug: (input: unknown) => Promise<unknown> }
      }
      admin: { posts: { mySummary: (input: unknown) => Promise<unknown> } }
    }

    await expect(client.content.home({})).rejects.toThrow()
    await expect(client.content.posts.bySlug({ slug: 'secret-slug' })).rejects.toThrow()
    await expect(client.admin.posts.mySummary({})).rejects.toThrow()

    const pathnames = captured.map((url) => new URL(url).pathname)
    expect(pathnames).toEqual(['/rpc/content/home', '/rpc/content/posts/bySlug', '/rpc/admin/posts/mySummary'])

    const origin = new URL(captured[0]!).origin
    expect(sanitizeResourceUrl(captured[0], origin)).toBe('/rpc/content.home')
    expect(sanitizeResourceUrl(captured[1], origin)).toBe('/rpc/content.posts.bySlug')
    expect(sanitizeResourceUrl(captured[2], origin)).toBe('/rpc/admin.posts.mySummary')
  })
})
