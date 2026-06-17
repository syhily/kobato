import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

describe('redirectsRouter', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function buildApp() {
    const { redirectsRouter } = await import('@/server/http/resources/redirects')
    const app = new Hono<Env>()
    app.route('/', redirectsRouter)
    return app
  }

  it('redirects /tags to home with 301', async () => {
    const app = await buildApp()
    const res = await app.request('/tags')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/')
    expect(res.headers.get('Cache-Control')).toContain('public')
  })

  it('redirects /search without query to home', async () => {
    const app = await buildApp()
    const res = await app.request('/search')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/')
  })

  it('redirects /search with query to path-style search', async () => {
    const app = await buildApp()
    const res = await app.request('/search?q=hello world')
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/search/hello%20world')
  })
})
