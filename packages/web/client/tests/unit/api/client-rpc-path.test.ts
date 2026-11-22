import { sanitizeResourceUrl } from '@kobato/web-client/lib/rum/rum-url-policy'
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
  it('matches the sanitizer RPC template for grouped top-level and nested procedures', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', captureFetch)

    const { orpc } = await import('@kobato/web-client/api/client')

    await expect(orpc.public.content.home({})).rejects.toThrow()
    await expect(orpc.public.content.posts.bySlug({ slug: 'secret-slug' })).rejects.toThrow()
    await expect(orpc.admin.posts.mySummary({})).rejects.toThrow()

    const pathnames = captured.map((url) => new URL(url).pathname)
    expect(pathnames).toEqual([
      '/rpc/public/content/home',
      '/rpc/public/content/posts/bySlug',
      '/rpc/admin/posts/mySummary',
    ])

    const origin = new URL(captured[0]!).origin
    expect(sanitizeResourceUrl(captured[0], origin)).toBe('/rpc/public.content.home')
    expect(sanitizeResourceUrl(captured[1], origin)).toBe('/rpc/public.content.posts.bySlug')
    expect(sanitizeResourceUrl(captured[2], origin)).toBe('/rpc/admin.posts.mySummary')
  })
})
