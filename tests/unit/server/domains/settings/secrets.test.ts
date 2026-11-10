import { describe, expect, it } from 'vitest'

import type { SecretFieldConfig } from '@/server/domains/settings/secrets'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_TO_BUNDLE_KEY } from '@/shared/config/sections'

// Look a declaration up by its mask key — never by array position, so a
// reordered or extended SECRET_FIELDS cannot silently rebind an assertion.
const secretBy = (maskKey: SecretFieldConfig['maskKey']) => SECRET_FIELDS.find((c) => c.maskKey === maskKey)!

function bundleWithSecrets(): BlogSettingsBundle {
  const bundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
  bundle.mail!.mail.smtpPass = 'pass-bb22'
  bundle.mail!.mail.mailgunApiKey = 'mg-cc33'
  bundle.assets!.storage.secretAccessKey = 's3-dd44'
  bundle.comments!.comments.githubToken = 'ghp-ee55'
  bundle.backup!.encryption.password = 'bk-ff66'
  bundle.observability!.observability.password = 'obs-gg77'
  bundle.observability!.observability.rumClientToken = 'rum-hh88'
  return bundle
}

describe('SECRET_FIELDS declarations', () => {
  it('declares every mask slot exactly once', () => {
    for (const config of SECRET_FIELDS) {
      expect(secretBy(config.maskKey)).toBe(config)
    }
  })

  it('derives bundleKey from the shared SECTION_TO_BUNDLE_KEY mapping', () => {
    for (const config of SECRET_FIELDS) {
      expect(config.bundleKey).toBe(SECTION_TO_BUNDLE_KEY[config.section])
    }
  })

  it('pins every declaration to a bucket/field that exists in the fixture bundle', () => {
    const bundle = bundleWithSecrets() as unknown as Record<string, Record<string, Record<string, unknown>>>
    for (const config of SECRET_FIELDS) {
      expect(bundle[config.bundleKey][config.path]).toHaveProperty(config.field)
    }
  })
})

describe('derived read/redact accessors', () => {
  it('read returns the configured secret for every entry', () => {
    const bundle = bundleWithSecrets()
    const values = SECRET_FIELDS.map((config) => config.read(bundle))
    expect(values).toEqual(['pass-bb22', 'mg-cc33', 's3-dd44', 'ghp-ee55', 'bk-ff66', 'obs-gg77', 'rum-hh88'])
  })

  it('read returns undefined for null sections and the raw value for blank secrets', () => {
    const bundle = bundleWithSecrets()
    bundle.mail = null
    bundle.assets!.storage.secretAccessKey = ''
    expect(secretBy('mailSmtpPassMask').read(bundle)).toBeUndefined()
    expect(secretBy('mailMailgunApiKeyMask').read(bundle)).toBeUndefined()
    // A blank slot reads back as '' (the mask story is "unset", not
    // "absent") — matching the previous hand-written accessors.
    expect(secretBy('assetsSecretAccessKeyMask').read(bundle)).toBe('')
  })

  it('read returns undefined for a non-string slot value (malformed input)', () => {
    const bundle = bundleWithSecrets()
    ;(bundle.mail!.mail as Record<string, unknown>).smtpPass = 42
    expect(secretBy('mailSmtpPassMask').read(bundle)).toBeUndefined()
  })

  it('redact blanks only its own slot and never mutates the input', () => {
    const bundle = bundleWithSecrets()
    const redacted = secretBy('mailSmtpPassMask').redact(bundle)

    expect(redacted).not.toBe(bundle)
    expect(redacted.mail?.mail.smtpPass).toBe('')
    // The other secrets and sibling fields survive untouched.
    expect(redacted.mail?.mail.mailgunApiKey).toBe('mg-cc33')
    expect(redacted.mail?.mail.smtpHost).toBe(bundle.mail?.mail.smtpHost)
    expect(bundle.mail?.mail.smtpPass).toBe('pass-bb22')
  })

  it('redact passes the bundle through by reference when there is nothing to blank', () => {
    const bundle = bundleWithSecrets()
    bundle.assets = null

    expect(secretBy('assetsSecretAccessKeyMask').redact(bundle)).toBe(bundle)

    bundle.assets = structuredClone(TEST_BLOG_SETTINGS_BUNDLE.assets)
    bundle.assets!.storage.secretAccessKey = ''
    expect(secretBy('assetsSecretAccessKeyMask').redact(bundle)).toBe(bundle)
  })

  it('redact passes malformed input through by reference (non-string value / missing bucket)', () => {
    const bundle = bundleWithSecrets()
    ;(bundle.mail!.mail as Record<string, unknown>).smtpPass = 42
    expect(secretBy('mailSmtpPassMask').redact(bundle)).toBe(bundle)
    expect((bundle.mail!.mail as Record<string, unknown>).smtpPass).toBe(42)

    ;(bundle.assets as unknown as Record<string, unknown>).storage = undefined
    expect(secretBy('assetsSecretAccessKeyMask').redact(bundle)).toBe(bundle)
  })
})
