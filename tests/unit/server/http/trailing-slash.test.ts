import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { trailingSlashNormaliser } from '@/server/http/middlewares/trailing-slash'

async function createApp(): Promise<Hono<Env>> {
  const app = new Hono<Env>()
  app.use(trailingSlashNormaliser)
  // Any request that survives the middleware should land here.
  app.all('*', (c) => c.json({ path: c.req.path, method: c.req.method }, 200))
  return app
}

describe('trailingSlashNormaliser', () => {
  describe('redirects trailing slashes with 301', () => {
    it('redirects /foo/ → /foo', async () => {
      const app = await createApp()
      const res = await app.request('/foo/')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo')
    })

    it('redirects /foo/bar/ → /foo/bar', async () => {
      const app = await createApp()
      const res = await app.request('/foo/bar/')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo/bar')
    })

    it('collapses multiple trailing slashes /foo/// → /foo', async () => {
      const app = await createApp()
      const res = await app.request('/foo///')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo')
    })

    it('preserves query strings without the trailing slash', async () => {
      const app = await createApp()
      const res = await app.request('/foo/?bar=baz')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo?bar=baz')
    })

    it('preserves multiple query parameters', async () => {
      const app = await createApp()
      const res = await app.request('/foo/?bar=baz&qux=quux')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo?bar=baz&qux=quux')
    })

    it('strips bare ? with no params (URL parser normalises it away)', async () => {
      const app = await createApp()
      const res = await app.request('/foo/?')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo')
    })
  })

  describe('skips paths that should not be normalised', () => {
    it('does not redirect the root path /', async () => {
      const app = await createApp()
      const res = await app.request('/')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/' })
    })

    it('does not redirect /rpc/ paths', async () => {
      const app = await createApp()
      const res = await app.request('/rpc/v1/posts')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/rpc/v1/posts' })
    })

    it('does not redirect /rpc/ nested trailing slash', async () => {
      const app = await createApp()
      const res = await app.request('/rpc/v1/posts/')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/rpc/v1/posts/' })
    })

    it('does not redirect /health', async () => {
      const app = await createApp()
      const res = await app.request('/health')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/health' })
    })

    it('does not redirect /ready', async () => {
      const app = await createApp()
      const res = await app.request('/ready')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/ready' })
    })
  })

  describe('skips non-GET/HEAD methods', () => {
    it('does not redirect POST /foo/', async () => {
      const app = await createApp()
      const res = await app.request('/foo/', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo/', method: 'POST' })
    })

    it('does not redirect PUT /foo/', async () => {
      const app = await createApp()
      const res = await app.request('/foo/', { method: 'PUT' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo/', method: 'PUT' })
    })

    it('does not redirect DELETE /foo/', async () => {
      const app = await createApp()
      const res = await app.request('/foo/', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo/', method: 'DELETE' })
    })

    it('does not redirect PATCH /foo/', async () => {
      const app = await createApp()
      const res = await app.request('/foo/', { method: 'PATCH' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo/', method: 'PATCH' })
    })
  })

  describe('HEAD is treated like GET', () => {
    it('redirects HEAD /foo/ → /foo', async () => {
      const app = await createApp()
      const res = await app.request('/foo/', { method: 'HEAD' })
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/foo')
    })
  })

  describe('paths without trailing slash are untouched', () => {
    it('passes through /foo', async () => {
      const app = await createApp()
      const res = await app.request('/foo')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo' })
    })

    it('passes through /foo/bar', async () => {
      const app = await createApp()
      const res = await app.request('/foo/bar')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo/bar' })
    })

    it('passes through /foo?bar=baz (no trailing slash, has query)', async () => {
      const app = await createApp()
      const res = await app.request('/foo?bar=baz')
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ path: '/foo' })
    })
  })

  describe('edge cases', () => {
    it('handles paths with only slashes after the first segment /a// → /a', async () => {
      const app = await createApp()
      const res = await app.request('/a//')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/a')
    })

    it('handles deep nested paths /a/b/c/d/ → /a/b/c/d', async () => {
      const app = await createApp()
      const res = await app.request('/a/b/c/d/')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/a/b/c/d')
    })

    it('handles deep nested paths with query /a/b/c/d/?e=f → /a/b/c/d?e=f', async () => {
      const app = await createApp()
      const res = await app.request('/a/b/c/d/?e=f')
      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('/a/b/c/d?e=f')
    })
  })
})
