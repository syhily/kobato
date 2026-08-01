import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'

/**
 * Derive the admin display masks: the last 4 characters of every
 * configured secret, or `null` when the secret is unset. The explicit
 * initializer keeps the output total — a new SECRET_FIELDS entry fails
 * type-checking here until its mask slot is added.
 */
export function computeSecretMasks(bundle: BlogSettingsBundle): SecretMasks {
  const masks: SecretMasks = {
    mailApiKeyMask: null,
    mailSmtpPassMask: null,
    mailMailgunApiKeyMask: null,
    assetsSecretAccessKeyMask: null,
  }
  for (const config of SECRET_FIELDS) {
    const value = config.read(bundle)
    masks[config.maskKey] = typeof value === 'string' && value !== '' ? value.slice(-4) : null
  }
  return masks
}

/**
 * Copy the bundle with every configured secret blanked, so admin-facing
 * payloads never carry ciphertext or plaintext secrets. Sections without
 * secrets keep their reference; the input is never mutated.
 */
export function redactSecretsFromBundle(bundle: BlogSettingsBundle): BlogSettingsBundle {
  let redacted: BlogSettingsBundle = { ...bundle }
  for (const config of SECRET_FIELDS) {
    redacted = config.redact(redacted)
  }
  return redacted
}
