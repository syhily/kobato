import { describe, expect, it } from 'vitest'

import {
  observabilityDefaults,
  observabilitySchema,
  observabilityWriteSchema,
} from '@/server/domains/settings/sections/observability'

const VALID = {
  observability: {
    enabled: true,
    endpoint: 'https://obs.example.com',
    organization: 'my-site_01',
    username: 'admin@example.com',
    password: 'secret',
    sampleRate: 0.5,
    includeRedactedSql: true,
    logs: { enabled: true },
    frontend: { enabled: true, sessionSampleRate: 25 },
    rumClientToken: 'rum-token',
    verifiedFingerprint: 'abc',
    provisionedFingerprint: 'def',
  },
}

function issuesOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues ?? []
}

describe('observability read schema', () => {
  it('accepts a fully-populated payload', () => {
    expect(observabilitySchema.safeParse(VALID).success).toBe(true)
  })

  it('validates the registry defaults through the schema', () => {
    expect(observabilitySchema.safeParse(observabilityDefaults).success).toBe(true)
  })

  it('fills every slot from defaults when the stored row is sparse', () => {
    const parsed = observabilitySchema.parse({ observability: {} })
    expect(parsed.observability.enabled).toBe(false)
    expect(parsed.observability.endpoint).toBe('')
    expect(parsed.observability.organization).toBe('')
    expect(parsed.observability.username).toBe('')
    expect(parsed.observability.sampleRate).toBe(1)
    expect(parsed.observability.includeRedactedSql).toBe(false)
    expect(parsed.observability.logs).toEqual({ enabled: false })
    expect(parsed.observability.frontend).toEqual({ enabled: false, sessionSampleRate: 100 })
    expect(parsed.observability.verifiedFingerprint).toBe('')
    expect(parsed.observability.provisionedFingerprint).toBe('')
  })

  it('keeps the read schema permissive: a stored plain-HTTP remote origin still hydrates', () => {
    const parsed = observabilitySchema.safeParse({
      observability: { ...VALID.observability, endpoint: 'http://obs.example.com' },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts form-style boolean strings', () => {
    const parsed = observabilitySchema.parse({
      observability: { enabled: 'true', includeRedactedSql: 'false', logs: { enabled: 'true' } },
    })
    expect(parsed.observability.enabled).toBe(true)
    expect(parsed.observability.includeRedactedSql).toBe(false)
    expect(parsed.observability.logs.enabled).toBe(true)
  })

  it('keeps the password and rum token optional (omitted means "keep the stored value")', () => {
    const parsed = observabilitySchema.parse({
      observability: { ...VALID.observability, password: undefined, rumClientToken: undefined },
    })
    expect(parsed.observability.password).toBeUndefined()
    expect(parsed.observability.rumClientToken).toBeUndefined()
  })
})

describe('observability write schema', () => {
  it.each([
    ['a bare https origin', 'https://obs.example.com'],
    ['a loopback http origin', 'http://127.0.0.1:5080'],
    ['an empty value', ''],
  ])('accepts %s', (_label, endpoint) => {
    const result = observabilityWriteSchema.safeParse({
      observability: { ...VALID.observability, endpoint },
    })
    expect(result.success).toBe(true)
  })

  it.each([
    ['embedded credentials', 'https://user:pass@obs.example.com', 'admin.settings.observability.error.endpointInvalid'],
    ['a path', 'https://obs.example.com/base', 'admin.settings.observability.error.endpointInvalid'],
    ['a query string', 'https://obs.example.com/?a=1', 'admin.settings.observability.error.endpointInvalid'],
    ['a non-http scheme', 'ftp://obs.example.com', 'admin.settings.observability.error.endpointInvalid'],
    ['plain HTTP to a remote host', 'http://obs.example.com', 'admin.settings.observability.error.endpointHttps'],
  ])('rejects %s', (_label, endpoint, message) => {
    const result = observabilityWriteSchema.safeParse({
      observability: { ...VALID.observability, endpoint },
    })
    expect(result.success).toBe(false)
    const issues = issuesOf(result)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toEqual(['observability', 'endpoint'])
    expect(issues[0]?.message).toBe(message)
  })

  it.each(['../evil', 'a/b', 'with space', '.', '-leading', 'a'.repeat(63) + '$'])(
    'rejects the organization %j',
    (organization) => {
      const result = observabilityWriteSchema.safeParse({
        observability: { ...VALID.observability, organization },
      })
      expect(result.success).toBe(false)
      expect(issuesOf(result)[0]?.path).toEqual(['observability', 'organization'])
      expect(issuesOf(result)[0]?.message).toBe('admin.settings.observability.error.organizationInvalid')
    },
  )

  it('rejects an over-long organization through the schema bound', () => {
    const result = observabilityWriteSchema.safeParse({
      observability: { ...VALID.observability, organization: 'a'.repeat(65) },
    })
    expect(result.success).toBe(false)
  })

  it('accepts an empty organization (not configured yet)', () => {
    expect(
      observabilityWriteSchema.safeParse({ observability: { ...VALID.observability, organization: '' } }).success,
    ).toBe(true)
  })

  it('rejects unknown keys at the root and in nested buckets', () => {
    const root = observabilityWriteSchema.safeParse({ ...VALID, extra: true })
    expect(root.success).toBe(false)

    const nested = observabilityWriteSchema.safeParse({
      observability: { ...VALID.observability, frontend: { enabled: true, sessionSampleRate: 10, extra: true } },
    })
    expect(nested.success).toBe(false)
  })

  it('rejects out-of-range sampling rates', () => {
    expect(
      observabilityWriteSchema.safeParse({ observability: { ...VALID.observability, sampleRate: 1.5 } }).success,
    ).toBe(false)
    expect(
      observabilityWriteSchema.safeParse({
        observability: { ...VALID.observability, frontend: { enabled: true, sessionSampleRate: 101 } },
      }).success,
    ).toBe(false)
  })
})
