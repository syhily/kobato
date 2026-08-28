import { describe, expect, it } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { deepFreeze } from '#/_helpers/deep-freeze'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { redactSecretsFromBundle } from '@/server/domains/settings/services/masks'

function bundleWithSecrets(): BlogSettingsBundle {
  const bundle = structuredClone(TEST_BLOG_SETTINGS_BUNDLE)
  bundle.mail!.mail.apiKey = 'key-aa11'
  bundle.mail!.mail.smtpPass = 'pass-bb22'
  bundle.mail!.mail.mailgunApiKey = 'mg-cc33'
  bundle.assets!.storage.secretAccessKey = 's3-dd44'
  bundle.comments!.comments.githubToken = 'ghp-ee55'
  return bundle
}

describe('redactSecretsFromBundle', () => {
  it('blanks every configured secret and keeps the sibling fields intact', () => {
    const redacted = redactSecretsFromBundle(bundleWithSecrets())

    expect(redacted.mail?.mail.apiKey).toBe('')
    expect(redacted.mail?.mail.smtpPass).toBe('')
    expect(redacted.mail?.mail.mailgunApiKey).toBe('')
    expect(redacted.assets?.storage.secretAccessKey).toBe('')
    expect(redacted.comments?.comments.githubToken).toBe('')
    // Non-secret neighbours survive the redaction untouched.
    expect(redacted.mail?.mail.host).toBe(TEST_BLOG_SETTINGS_BUNDLE.mail?.mail.host)
    expect(redacted.mail?.mail.sender).toBe(TEST_BLOG_SETTINGS_BUNDLE.mail?.mail.sender)
    expect(redacted.assets?.storage.accessKeyId).toBe(TEST_BLOG_SETTINGS_BUNDLE.assets?.storage.accessKeyId)
    expect(redacted.assets?.asset).toEqual(TEST_BLOG_SETTINGS_BUNDLE.assets?.asset)
    // Sections without secrets are carried over by reference value.
    expect(redacted.security).toEqual(TEST_BLOG_SETTINGS_BUNDLE.security)
    expect(redacted.limits).toEqual(TEST_BLOG_SETTINGS_BUNDLE.limits)
  })

  it('never mutates the input bundle, even when it is deep-frozen', () => {
    const frozen = deepFreeze(bundleWithSecrets())

    const redacted = redactSecretsFromBundle(frozen)

    expect(redacted).not.toBe(frozen)
    expect(frozen.mail?.mail.apiKey).toBe('key-aa11')
    expect(frozen.assets?.storage.secretAccessKey).toBe('s3-dd44')
  })

  it('skips null sections and absent secret slots without inventing buckets', () => {
    const bundle = bundleWithSecrets()
    bundle.mail = null
    bundle.assets!.storage.secretAccessKey = ''

    const redacted = redactSecretsFromBundle(bundle)

    expect(redacted.mail).toBeNull()
    // An empty secret stays empty (the mask story is "unset", not "blanked").
    expect(redacted.assets?.storage.secretAccessKey).toBe('')
  })

  it('covers every SECRET_FIELDS entry — a new secret cannot escape redaction', () => {
    const redacted = redactSecretsFromBundle(bundleWithSecrets())

    // Runtime parity guard: walk the config the same way the redactor
    // does and assert every configured slot came out blanked.
    for (const { bundleKey, path, field } of SECRET_FIELDS) {
      const section = redacted[bundleKey] as unknown as Record<string, Record<string, unknown>> | null
      expect(section?.[path][field]).toBe('')
    }
  })
})
