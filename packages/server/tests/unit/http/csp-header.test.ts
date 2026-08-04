import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { buildCspHeader } from '@kobato/server/http/middleware-pipeline'
import { describe, expect, it } from 'vitest'

// `buildCspHeader` is a pure function: given a bundle + nonce + dev flag it
// returns the CSP string. These tests exercise the REAL production logic
// (font origin extraction, asset host, dev-mode unsafe-inline/blob workers)
// rather than a parallel inline copy — closing the gap called out in the
// legacy `tests/it/server/http/csp-middleware.test.ts` comment.

const NONCE = 'abcdef0123456789'

/** Build a minimal bundle carrying only the fields `buildCspHeader` reads. */
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
    // Self-hosted web fonts live under /fonts/embedded/* (local) or the asset
    // CDN host (S3); both are already covered by 'self' / the asset host.
    // No external font origin (Google Fonts etc.) should ever appear.
    const csp = buildCspHeader({ bundle: bundleWith({ host: null }), nonce: NONCE, isDev: false })
    expect(csp).not.toContain('fonts.googleapis.com')
    expect(csp).not.toContain('fonts.bunny.net')
    expect(csp).not.toMatch(/font-src[^;]*https:/)
  })

  it('adds the asset host as an https origin', () => {
    const csp = buildCspHeader({ bundle: bundleWith({ host: 'cdn.example.com' }), nonce: NONCE, isDev: false })
    expect(csp).toContain('https://cdn.example.com')
    // The asset host must land in style-src / font-src / img-src / media-src.
    expect(csp).toContain('style-src ' + "'self' 'unsafe-inline'  https://cdn.example.com")
    expect(csp).toContain('font-src ' + "'self'  https://cdn.example.com")
    expect(csp).toContain('img-src ' + "'self' data: blob:  https://cdn.example.com")
  })

  it('handles a null bundle without throwing', () => {
    const csp = buildCspHeader({ bundle: null, nonce: NONCE, isDev: false })
    // No external origins: the "extra" suffix collapses to empty so
    // directives keep their trailing space but no bogus origin appears.
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    // No `https://` host leaks in when nothing was configured.
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
