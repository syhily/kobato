import type { BlogSettingsBundle, SecretMasks } from '@kobato/settings/types'

import { SECRET_FIELDS } from '@kobato/settings/secrets'

export function computeSecretMasks(bundle: BlogSettingsBundle): SecretMasks {
  const masks: SecretMasks = {
    mailSmtpPassMask: null,
    mailMailgunApiKeyMask: null,
    assetsSecretAccessKeyMask: null,
    commentsGithubTokenMask: null,
    backupEncryptionPasswordMask: null,
    observabilityPasswordMask: null,
    observabilityRumClientTokenMask: null,
  }
  for (const config of SECRET_FIELDS) {
    const value = config.read(bundle)
    masks[config.maskKey] = typeof value === 'string' && value !== '' ? value.slice(-4) : null
  }
  return masks
}

export function redactSecretsFromBundle(bundle: BlogSettingsBundle): BlogSettingsBundle {
  let redacted: BlogSettingsBundle = { ...bundle }
  for (const config of SECRET_FIELDS) {
    redacted = config.redact(redacted)
  }
  return redacted
}
