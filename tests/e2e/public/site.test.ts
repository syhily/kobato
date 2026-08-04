import { E2eClient, e2eEnv } from '#/_helpers/e2e-client'

import { describe, expect, it } from 'vitest'

const env = e2eEnv()

describe('public site (HTTP e2e)', () => {
  it('GET /health — 200 on the seeded instance', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/health')
    expect(res.status).toBe(200)
  })

  it('GET / — core app shell carries the seeded site title', async () => {
    // Core serves the admin app at `/` (public SSR lives in the frontend
    // app); the seeded site title still reaches the shell's <title>.
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    // 'Kobato Smoke' — the title seeded by scripts/sea/instance.ts.
    expect(await res.text()).toContain('Kobato Smoke')
  })

  it('GET /api/content/v1/home — headless home listing', async () => {
    // Public SSR pages live in the frontend app; the core e2e asserts the
    // headless content face the SSR consumes (the archives page itself is
    // the frontend line's smoke concern).
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/api/content/v1/home')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('GET /feed — RSS feed over HTTP', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/feed')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/xml|rss/i)
  })

  it('GET /sitemap.xml — XML sitemap', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<?xml')
  })
})
