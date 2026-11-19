import { sanitizeResourceUrl } from '@kobato/web-client/lib/rum/rum-url-policy.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

    const { orpc } = await import('@kobato/web-client/api/client.ts')
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
