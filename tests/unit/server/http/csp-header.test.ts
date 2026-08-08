import { describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { buildCspHeader } from '@/server/http/middleware-pipeline'

// Exercises the real production `buildCspHeader` (bundle + nonce + dev flag
// → CSP string), not a parallel inline copy.

const NONCE = 'abcdef0123456789'

function bundleWith(overrides: { host?: string | null }): BlogSettingsBundle {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets:
      overrides.host === null
        ? null
        : { ...TEST_BLOG_SETTINGS_BUNDLE.assets!, asset: { host: overrides.host ?? '', scheme: 'https' } },
  }
}

describe('buildCspHeader', () => {
  it('includes the nonce in script-src in production', () => {
    const csp = buildCspHeader({ bundle: bundleWith({ host: null }), nonce: NONCE, isDev: false })
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0]
    expect(scriptSrc).toBe(`script-src 'self' 'nonce-${NONCE}'`)
    expect(scriptSrc).not.toContain('unsafe-inline')
  })

  it('uses unsafe-inline in script-src in dev mode and drops the nonce', () => {
    const csp = buildCspHeader({ bundle: bundleWith({ host: null }), nonce: NONCE, isDev: true })
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0]
    expect(scriptSrc).toBe("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain(`nonce-${NONCE}`)
  })

  it('adds blob: to worker-src only in dev mode', () => {
    const devCsp = buildCspHeader({ bundle: null, nonce: NONCE, isDev: true })
    const devWorkerSrc = devCsp.match(/worker-src[^;]*/)?.[0]
    expect(devWorkerSrc).toBe("worker-src 'self' blob:")

    const prodCsp = buildCspHeader({ bundle: null, nonce: NONCE, isDev: false })
    const prodWorkerSrc = prodCsp.match(/worker-src[^;]*/)?.[0]
    expect(prodWorkerSrc).toBe("worker-src 'self'")
  })

  it('does NOT inject any per-font origin (self-hosted fonts are served from self / asset host)', () => {
    const csp = buildCspHeader({ bundle: bundleWith({ host: null }), nonce: NONCE, isDev: false })
    expect(csp).not.toContain('fonts.googleapis.com')
    expect(csp).not.toContain('fonts.bunny.net')
    expect(csp).not.toMatch(/font-src[^;]*https:/)
  })

  it('adds the asset host as an https origin', () => {
    const csp = buildCspHeader({ bundle: bundleWith({ host: 'cdn.example.com' }), nonce: NONCE, isDev: false })
    expect(csp).toContain('https://cdn.example.com')
    expect(csp).toContain('style-src ' + "'self' 'unsafe-inline'  https://cdn.example.com")
    expect(csp).toContain('font-src ' + "'self'  https://cdn.example.com")
    expect(csp).toContain('img-src ' + "'self' data: blob:  https://cdn.example.com")
  })

  it('handles a null bundle without throwing', () => {
    const csp = buildCspHeader({ bundle: null, nonce: NONCE, isDev: false })
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toMatch(/https:\/\/[^']/)
  })

  it('always sets the restrictive baseline directives (object-src, frame-ancestors, form-action, base-uri)', () => {
    for (const isDev of [true, false]) {
      const csp = buildCspHeader({ bundle: null, nonce: NONCE, isDev })
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain('upgrade-insecure-requests')
    }
  })
})
