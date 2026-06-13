import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { corsMiddleware } from '@/server/http/middlewares/cors'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

function buildApp() {
  const app = new Hono()
  app.use('*', corsMiddleware())
  app.get('/', (c) => c.text('ok'))
  app.options('/', (c) => c.text('preflight'))
  return app
}

function withCors(enabled: boolean, origins: string[]): BlogSettingsBundle {
  const security = TEST_BLOG_SETTINGS_BUNDLE.security!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: {
      ...security,
      cors: { enabled, origins },
    },
  }
}

describe('server/http/middlewares/cors — corsMiddleware', () => {
  beforeEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  afterEach(() => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('is a no-op when cors.enabled is false', async () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(withCors(false, []))
    const app = buildApp()
    const res = await app.request('/', { headers: { Origin: 'https://other.example' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('refuses CORS (empty allow-origin) when enabled but origins list is empty', async () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(withCors(true, []))
    const app = buildApp()
    const res = await app.request('/', { headers: { Origin: 'https://other.example' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://other.example')
  })

  it('reflects the request origin when it is in the allowlist', async () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(withCors(true, ['https://allowed.example']))
    const app = buildApp()
    const res = await app.request('/', { headers: { Origin: 'https://allowed.example' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example')
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('does not reflect an origin that is not in the allowlist', async () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(withCors(true, ['https://allowed.example']))
    const app = buildApp()
    const res = await app.request('/', { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example')
  })

  it('skips CORS pre-install (when the bundle is null)', async () => {
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
    const app = buildApp()
    const res = await app.request('/', { headers: { Origin: 'https://other.example' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
