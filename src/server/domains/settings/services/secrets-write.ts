import type { Setting } from '@/server/infra/db/types'
import type { SettingsSection } from '@/shared/config/sections'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { isRecord } from '@/server/domains/settings/services/section-patch'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'

/**
 * Shape the validated payload into the row to persist: omitted secrets carry over from
 * the stored row, and the assets `branding` bucket merges instead of replacing.
 */
export function applySectionPatch(
  section: SettingsSection,
  validated: Record<string, unknown>,
  storedRow: Setting | null,
): Record<string, unknown> {
  let row = validated
  const secretConfigs = SECRET_FIELDS.filter((f) => f.section === section)
  if (secretConfigs.length > 0) {
    // An omitted secret keeps the stored value; a patch including every secret preserves nothing.
    const needsExisting = secretConfigs.some((config) => !hasSecretInRow(row, config.path, config.field))
    if (needsExisting) {
      for (const secretConfig of secretConfigs) {
        row = preserveSecretOnPatch(row, storedRow, secretConfig.path, secretConfig.field)
      }
    }
  }
  if (section === 'assets') {
    row = preserveBrandingOnPatch(row, storedRow)
  }
  return row
}

/**
 * Encrypt every plaintext secret on a shallow row copy; already-encrypted values
 * (recognised by their prefix) pass through unchanged.
 */
export function encryptSecretsInRow(section: SettingsSection, row: Record<string, unknown>): Record<string, unknown> {
  const configs = SECRET_FIELDS.filter((f) => f.section === section)
  if (configs.length === 0) {
    return row
  }
  const next: Record<string, unknown> = { ...row }
  for (const config of configs) {
    const bucket: unknown = next[config.path]
    if (!isRecord(bucket)) {
      continue
    }
    const value = bucket[config.field]
    if (typeof value !== 'string') {
      continue
    }
    Object.assign(bucket, { [config.field]: encryptIfNeeded(value) })
  }
  return next
}

function hasSecretInRow(row: Record<string, unknown>, payloadPath: string, secretKey: string): boolean {
  const bucket: unknown = row[payloadPath]
  return isRecord(bucket) && secretKey in bucket && bucket[secretKey] !== undefined
}

function preserveBrandingOnPatch(row: Record<string, unknown>, storedRow: Setting | null): Record<string, unknown> {
  const storedData: unknown = storedRow?.data
  const storedBranding: unknown = isRecord(storedData) ? storedData.branding : undefined
  const existingBranding = isRecord(storedBranding) ? storedBranding : undefined
  const incomingBranding = isRecord(row.branding) ? row.branding : undefined
  if (existingBranding === undefined && incomingBranding === undefined) {
    return row
  }
  const merged: Record<string, unknown> = { ...existingBranding, ...incomingBranding }
  return { ...row, branding: merged }
}

function preserveSecretOnPatch(
  validated: Record<string, unknown>,
  existingRow: Setting | null,
  payloadPath: string,
  secretKey: string,
): Record<string, unknown> {
  const incomingValue: unknown = validated[payloadPath]
  const incoming = isRecord(incomingValue) ? incomingValue : {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return validated
  }

  const existingData: unknown = existingRow?.data
  const existingPayloadValue: unknown = isRecord(existingData) ? existingData[payloadPath] : undefined
  const existingPayload = isRecord(existingPayloadValue) ? existingPayloadValue : undefined

  // Pass the existing ciphertext through unchanged — encryptSecretsInRow skips re-encryption.
  const previousSecret = typeof existingPayload?.[secretKey] === 'string' ? existingPayload[secretKey] : ''
  const nextPayload: Record<string, unknown> = { ...incoming, [secretKey]: previousSecret }
  return { ...validated, [payloadPath]: nextPayload }
}
