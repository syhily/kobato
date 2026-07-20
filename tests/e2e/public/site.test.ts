import { describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv } from '#/_helpers/e2e-client'

const env = e2eEnv()

describe('public site (HTTP e2e)', () => {
  it('GET /health — 200 on the seeded instance', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/health')
    expect(res.status).toBe(200)
  })

  it('GET / — SSR home carries the seeded site title', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    // 'Kobato Smoke' — the title seeded by scripts/sea/instance.ts.
    expect(await res.text()).toContain('Kobato Smoke')
  })

  it('GET /archives — 200 text/html', async () => {
    const client = new E2eClient(env.baseUrl)
    const res = await client.get('/archives')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
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
