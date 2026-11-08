import { describe, expect, it } from 'vitest'

import { assetsValidationMessages, assetsWriteSchema } from '@/server/domains/settings/sections/assets'
import { securitySchema, securityValidationMessages } from '@/server/domains/settings/sections/security'
import { zodIssueToWire } from '@/server/infra/http/error-descriptor'

// Settings custom Zod prose is a typed catalog id at the schema, and the server
// boundary (zodIssuesToWire) turns it into a descriptor: typed key + params +
// an English fallback + the producer code + the preserved field path.

function issueOf(
  schema: { safeParse: (input: unknown) => { success: boolean; error?: { issues: unknown[] } } },
  input: unknown,
) {
  const parsed = schema.safeParse(input)
  expect(parsed.success).toBe(false)
  return zodIssueToWire(parsed.error!.issues[0] as Parameters<typeof zodIssueToWire>[0])
}

const VALID_ASSETS = {
  asset: { host: 'cdn.example.com', scheme: 'https' },
  storage: {
    enabled: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    urlTemplate: '',
  },
  upload: { maxBytes: 1024 * 1024, jpegQuality: 82 },
}

describe('settings/assets — typed validation messages', () => {
  it('maps the plaintext-endpoint rule to a descriptor with its path', () => {
    const wire = issueOf(assetsWriteSchema, {
      ...VALID_ASSETS,
      storage: { ...VALID_ASSETS.storage, endpoint: 'http://minio.internal:9000' },
    })

    expect(wire).toMatchObject({
      messageKey: assetsValidationMessages.endpointHttps,
      code: 'custom',
      path: ['storage', 'endpoint'],
    })
    expect(wire.fallbackMessage).toContain('HTTPS')
    expect(wire.fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it('maps the URL-template rule, keeping the literal {src} placeholder', () => {
    const wire = issueOf(assetsWriteSchema, {
      ...VALID_ASSETS,
      storage: { ...VALID_ASSETS.storage, urlTemplate: 'http://cdn.example.com/{src}?w={width}' },
    })

    expect(wire.messageKey).toBe(assetsValidationMessages.urlTemplate)
    expect(wire.path).toEqual(['storage', 'urlTemplate'])
    expect(wire.fallbackMessage).toContain('{src}')
  })

  it('lists the offending S3 field as a param in the required-field rule', () => {
    const wire = issueOf(assetsWriteSchema, {
      ...VALID_ASSETS,
      storage: { ...VALID_ASSETS.storage, enabled: true },
    })

    expect(wire.messageKey).toBe(assetsValidationMessages.s3FieldRequired)
    expect(wire.params).toMatchObject({ label: expect.any(String) })
    expect(wire.path?.[0]).toBe('storage')
  })

  it('keeps robots.txt and host-name messages typed', () => {
    const robots = issueOf(assetsWriteSchema, {
      ...VALID_ASSETS,
      branding: { robotsTxt: 'User-agent: *\nDisallow: /\u00e9' },
    })
    expect(robots.messageKey).toBe(assetsValidationMessages.robotsPrintable)
    expect(robots.path).toEqual(['branding', 'robotsTxt'])

    const host = issueOf(assetsWriteSchema, {
      ...VALID_ASSETS,
      asset: { host: 'bad host!', scheme: 'https' },
    })
    expect(host.messageKey).toBe(assetsValidationMessages.bucketName)
    expect(host.path).toEqual(['asset', 'host'])
  })
})

describe('settings/security — typed validation messages', () => {
  it('maps the dangerous CSRF exemption rule to a descriptor with its path', () => {
    const wire = issueOf(securitySchema, { csrf: { enabled: true, exemptPaths: ['/rpc/anything'] } })

    expect(wire).toMatchObject({
      messageKey: securityValidationMessages.dangerousExemptPath,
      code: 'custom',
      path: ['csrf', 'exemptPaths'],
    })
    expect(wire.fallbackMessage).toContain('/rpc/')
    expect(wire.fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
