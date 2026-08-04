import { securitySchema } from '@kobato/server/domains/settings/sections/security'
import { describe, expect, it } from 'vitest'

describe('securitySchema', () => {
  it('accepts a valid payload', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/webhook/github'] },
      cors: { enabled: false, origins: [] },
    })
    expect(result.success).toBe(true)
  })

  it('applies csrf defaults', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.csrf.exemptPaths).toEqual([])
    }
  })

  it('applies cors defaults when omitted', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cors).toEqual({ enabled: false, origins: [] })
    }
  })

  it('rejects exempt paths exceeding max count', () => {
    const paths = Array.from({ length: 21 }, (_, i) => `/rpc/path-${i}`)
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: paths },
    })
    expect(result.success).toBe(false)
  })

  it('strips empty strings from exempt paths via min(1)', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc/valid', '   ', ''] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects dangerous exempt paths that blanket-disable CSRF', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc/webhook', '/rpc/'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects /rpc as an exempt path', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects /rpc/ subpaths as exempt paths', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc/admin'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects nested /rpc/ subpaths as exempt paths', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc/admin/nested'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects /api as an exempt path (P1-16)', () => {
    // `/api` fronts the Hono API surface behind csrfGuard
    // (upload/restore/branding/maxmind) — exempting the prefix silently
    // disables CSRF on state-changing routes.
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/api'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects /api/ subpaths as exempt paths (P1-16)', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/api/admin'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects nested /api/ subpaths as exempt paths (P1-16)', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/api/webhook'] },
    })
    expect(result.success).toBe(false)
  })

  it('accepts exempt paths outside the /rpc and /api prefixes', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/webhook/github', '/feed.xml'] },
    })
    expect(result.success).toBe(true)
  })

  it('rejects / as an exempt path', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/'] },
    })
    expect(result.success).toBe(false)
  })

  it('rejects an /api/ subpath even when it looks harmless (P1-16)', () => {
    // Pre-P1-16 this payload was accepted: any `/api` prefix exempts the
    // whole Hono API surface, so there is no safe `/api/...` exemption.
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/api/public'] },
    })
    expect(result.success).toBe(false)
  })

  it('accepts string "true" for enabled (coerceBoolean)', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: 'true' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.csrf.enabled).toBe(true)
    }
  })

  it('accepts string "false" for enabled (coerceBoolean)', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: 'false' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.csrf.enabled).toBe(false)
    }
  })

  it('rejects more than 20 origins', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true },
      cors: {
        enabled: true,
        origins: Array.from({ length: 21 }, (_, i) => `https://site${i}.example.com`),
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty origin string', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true },
      cors: {
        enabled: true,
        origins: [''],
      },
    })
    expect(result.success).toBe(false)
  })
})
