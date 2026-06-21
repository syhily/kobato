import { describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { buildCspHeader } from '@/server/http/middleware-pipeline'

// `buildCspHeader` is a pure function: given a bundle + nonce + dev flag it
// returns the CSP string. These tests exercise the REAL production logic
// (font origin extraction, asset host, dev-mode unsafe-inline/blob workers)
// rather than a parallel inline copy — closing the gap called out in the
// legacy `tests/it/server/http/csp-middleware.test.ts` comment.

const NONCE = 'abcdef0123456789'

/** Build a minimal bundle carrying only the fields `buildCspHeader` reads. */
function bundleWith(overrides: {
  fonts?: Partial<NonNullable<BlogSettingsBundle['fonts']>>
  host?: string | null
}): BlogSettingsBundle {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    fonts: {
      og: { family: '' },
      calendar: { family: '' },
      globalFamily: '',
      codeFamily: '',
      postFamily: '',
      globalCss: [],
      codeCss: [],
      postCss: [],
      ...overrides.fonts,
    },
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

  it('extracts font CSS origins into style-src and font-src', () => {
    const bundle = bundleWith({
      fonts: {
        globalCss: ['https://fonts.googleapis.com/css?family=Foo'],
        codeCss: [],
        postCss: ['https://fonts.bunny.net/css?family=Bar'],
      },
      host: null,
    })
    const csp = buildCspHeader({ bundle, nonce: NONCE, isDev: false })

    // The `extra` template literal injects a leading space before each
    // origin list, so directives with an `'unsafe-inline'` token carry
    // a double space before the origin list (mirrors production output).
    expect(csp).toContain('style-src ' + "'self' 'unsafe-inline'  https://fonts.googleapis.com https://fonts.bunny.net")
    expect(csp).toContain('font-src ' + "'self'  https://fonts.googleapis.com https://fonts.bunny.net")
    expect(csp).toContain('img-src ' + "'self' data: blob:  https://fonts.googleapis.com https://fonts.bunny.net")
    expect(csp).toContain('media-src ' + "'self'  https://fonts.googleapis.com https://fonts.bunny.net")
  })

  it('skips malformed font URLs without throwing', () => {
    const bundle = bundleWith({
      fonts: {
        globalCss: ['not-a-valid-url', 'https://valid.example.com/x.css'],
        codeCss: [],
        postCss: [],
      },
      host: null,
    })
    // Must not throw — invalid entry is silently dropped, valid one kept.
    const csp = buildCspHeader({ bundle, nonce: NONCE, isDev: false })
    expect(csp).toContain('https://valid.example.com')
    expect(csp).not.toContain('not-a-valid-url')
  })

  it('adds the asset host as an https origin', () => {
    const bundle = bundleWith({ host: 'cdn.example.com' })
    const csp = buildCspHeader({ bundle, nonce: NONCE, isDev: false })
    expect(csp).toContain('https://cdn.example.com')
    // The asset host must land in style-src / font-src / img-src / media-src.
    // (Same double-space quirk as the font-origin case above.)
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
