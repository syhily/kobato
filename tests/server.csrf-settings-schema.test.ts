import { describe, expect, it } from 'vitest'

import { securitySchema } from '@/server/domains/settings/schemas/security'

describe('securitySchema', () => {
  it('accepts a valid payload', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true, exemptPaths: ['/rpc/webhook'] },
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults', () => {
    const result = securitySchema.safeParse({
      csrf: { enabled: true },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.csrf.exemptPaths).toEqual([])
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
})
