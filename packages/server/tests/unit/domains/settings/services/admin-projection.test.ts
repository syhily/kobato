import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { projectSectionForAdmin } from '@kobato/server/domains/settings/services/admin-projection'
import { computeSecretMasks } from '@kobato/server/domains/settings/services/masks'
import { DomainError } from '@kobato/server/infra/http/errors'
import { describe, expect, it } from 'vitest'

function bundleWithSecrets(): BlogSettingsBundle {
  const bundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
  bundle.mail!.mail.apiKey = 'key-aa11'
  bundle.mail!.mail.smtpPass = 'pass-bb22'
  bundle.mail!.mail.mailgunApiKey = 'mg-cc33'
  bundle.assets!.storage.secretAccessKey = 's3-dd44'
  return bundle
}

describe('projectSectionForAdmin', () => {
  it('projects the mail section into the loader shape with masks instead of secrets', () => {
    const bundle = bundleWithSecrets()

    const projected = projectSectionForAdmin('mail', bundle, computeSecretMasks(bundle)) as {
      mail: Record<string, unknown>
    }

    expect(projected.mail.apiKeyMask).toBe('aa11')
    expect(projected.mail.smtpPassMask).toBe('bb22')
    expect(projected.mail.mailgunApiKeyMask).toBe('cc33')
    // The ciphertext/plaintext fields never reach the admin shape.
    expect('apiKey' in projected.mail).toBe(false)
    expect('smtpPass' in projected.mail).toBe(false)
    expect('mailgunApiKey' in projected.mail).toBe(false)
    expect(projected.mail.host).toBe(bundle.mail?.mail.host)
  })

  it('projects the assets section with the storage mask and the full branding status map', () => {
    const bundle = bundleWithSecrets()

    const projected = projectSectionForAdmin('assets', bundle, computeSecretMasks(bundle)) as {
      storage: Record<string, unknown>
      secretAccessKeyMask: string | null
      branding: Record<string, { etag: string }>
    }

    expect(projected.secretAccessKeyMask).toBe('dd44')
    expect('secretAccessKey' in projected.storage).toBe(false)
    expect(projected.storage.accessKeyId).toBe(bundle.assets?.storage.accessKeyId)
    // Every branding slot is present in the loader shape, even unset ones.
    expect(projected.branding.faviconSvg).toEqual({ etag: '' })
    expect(projected.branding.robotsTxt).toBe('')
  })

  it('projects a plain section as the redacted bundle slice', () => {
    const bundle = bundleWithSecrets()

    const projected = projectSectionForAdmin('security', bundle, computeSecretMasks(bundle))

    expect(projected).toEqual(bundle.security)
  })

  it('fails loudly with DomainError(INTERNAL) when the projected slice drifts from the schema', () => {
    const bundle = bundleWithSecrets()
    // `limits` validates against the registry schema: a string where the
    // DTO demands a number is exactly the drift the assembly gate exists
    // to catch.
    bundle.limits = { ...bundle.limits!, maxRequestBodySize: 'ten' as unknown as number }

    expect(() => projectSectionForAdmin('limits', bundle, computeSecretMasks(bundle))).toThrowError(DomainError)
    try {
      projectSectionForAdmin('limits', bundle, computeSecretMasks(bundle))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('INTERNAL')
      expect((e as DomainError).message).toContain('admin 投影形状校验失败(limits)')
    }
  })
})
