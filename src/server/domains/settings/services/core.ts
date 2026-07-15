import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { Setting } from '@/server/infra/db/types'
import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'

export type { SecretMasks }

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { SECTION_CHANGE_HANDLERS } from '@/server/domains/settings/services/section-changes'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { checkMailReady } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isValidPasskeyDomain } from '@/shared/utils/safe-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('settings.service')

export interface AdminBlogSettingsDto {
  bundle: BlogSettingsBundle | null
}

export async function getAdminBlogSettings(db: NodePgDatabase): Promise<AdminBlogSettingsDto> {
  const bundle = await hydrateBlogSettings(db)
  return { bundle }
}

export async function updateBlogSettingsSection<S extends SettingsSection>(
  db: NodePgDatabase,
  pool: Pool,
  section: S,
  payload: unknown,
  updatedBy: bigint | null,
): Promise<BlogSettingsBundle | null> {
  const meta = SECTION_REGISTRY[section]
  const parsed = await meta.schema.safeParseAsync(payload)
  if (!parsed.success) {
    throw new DomainError(
      'BAD_REQUEST',
      '设置数据无效',
      parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map(String),
      })),
    )
  }
  if (section === 'security') {
    const securityPayload = unsafeCast<{ otp?: { enabled?: boolean }; passkey?: { enabled?: boolean } }>(parsed.data)
    if (securityPayload.otp?.enabled) {
      const bundle = getBlogSettingsBundleSync()
      const mail = bundle?.mail?.mail
      if (!mail) {
        throw new DomainError('BAD_REQUEST', '开启 OTP 前请先完成邮件服务配置（接入域名、API Key、发件人邮箱）')
      }
      const ready = checkMailReady(mail)
      if (!ready.ready) {
        throw new DomainError('BAD_REQUEST', `开启 OTP 前请先完成邮件服务配置：${ready.message}`)
      }
    }
    if (securityPayload.passkey?.enabled) {
      const bundle = getBlogSettingsBundleSync()
      const website = bundle?.siteIdentity?.website
      if (!website) {
        throw new DomainError('BAD_REQUEST', '开启 Passkey 前请先配置站点域名（网站信息设置中的「站点地址」）')
      }
      if (!isValidPasskeyDomain(website)) {
        throw new DomainError(
          'BAD_REQUEST',
          '开启 Passkey 需要站点使用公开可访问的 HTTPS 域名（不能使用 localhost 或 IP 地址）',
        )
      }
    }
  }

  const bundle = await db.transaction(async (tx) => {
    const nextRow = await applySectionPatch(tx, section, parsed.data)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    await upsertSetting(tx, encryptedRow, updatedBy, meta.scope)

    return refreshBlogSettings(tx)
  })

  const handler = SECTION_CHANGE_HANDLERS.get(section)
  if (handler) {
    try {
      await handler(pool)
    } catch (e: unknown) {
      log.error('Section change handler failed', { section, error: String(e) })
    }
  }

  return bundle
}

export function computeSecretMasks(bundle: BlogSettingsBundle): SecretMasks {
  const masks = unsafeCast<Record<keyof SecretMasks, string | null>>({})
  for (const { bundleKey, path, field, maskKey } of SECRET_FIELDS) {
    const section = unsafeCast<Record<string, unknown> | null>(bundle[bundleKey])
    const bucket = unsafeCast<Record<string, unknown> | undefined>(section?.[path])
    const value = bucket?.[field]
    masks[maskKey] = typeof value === 'string' && value !== '' ? value.slice(-4) : null
  }
  return masks
}

export function redactSecretsFromBundle(bundle: BlogSettingsBundle): BlogSettingsBundle {
  const clone = unsafeCast<Record<string, unknown>>({ ...bundle })
  for (const { bundleKey, path, field } of SECRET_FIELDS) {
    const section = unsafeCast<Record<string, unknown> | null>(clone[bundleKey])
    if (section === null) {
      continue
    }
    const bucket = unsafeCast<Record<string, unknown> | undefined>(section[path])
    if (bucket && typeof bucket[field] === 'string' && bucket[field] !== '') {
      clone[bundleKey] = {
        ...section,
        [path]: { ...bucket, [field]: '' },
      }
    }
  }
  return unsafeCast<BlogSettingsBundle>(clone)
}

async function applySectionPatch(
  db: NodePgDatabase,
  section: SettingsSection,
  validated: unknown,
): Promise<Record<string, unknown>> {
  let row = unsafeCast<Record<string, unknown>>(validated)
  const secretConfigs = SECRET_FIELDS.filter((f) => f.section === section)
  if (secretConfigs.length > 0) {
    // Only hit the DB when at least one secret is missing from the
    // incoming patch — a patch that includes every secret is a
    // full overwrite and has nothing to preserve.
    const needsExisting = secretConfigs.some((config) => !hasSecretInRow(row, config.path, config.field))
    if (needsExisting) {
      // Read once and reuse for every secret in the section, so mail
      // (apiKey + smtpPass) costs one SELECT instead of two.
      const existingRow = await findSettingByScope(db, SECTION_REGISTRY[section].scope)
      for (const secretConfig of secretConfigs) {
        row = preserveSecretOnPatch(row, existingRow, secretConfig.path, secretConfig.field)
      }
    }
  }
  if (section === 'assets') {
    row = await preserveBrandingOnPatch(db, row)
  }
  return row
}

function hasSecretInRow(row: Record<string, unknown>, payloadPath: string, secretKey: string): boolean {
  const bucket = unsafeCast<Record<string, unknown> | undefined>(row[payloadPath])
  return bucket !== undefined && secretKey in bucket && bucket[secretKey] !== undefined
}

async function preserveBrandingOnPatch(
  db: NodePgDatabase,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const existingRow = await findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  const existingBranding = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(existingRow?.data)?.branding,
  )
  const incomingBranding = unsafeCast<Record<string, unknown> | undefined>(row.branding)
  if (existingBranding === undefined && incomingBranding === undefined) {
    return row
  }
  const merged: Record<string, unknown> = { ...existingBranding, ...incomingBranding }
  return { ...row, branding: merged }
}

function preserveSecretOnPatch(
  validated: unknown,
  existingRow: Setting | null,
  payloadPath: string,
  secretKey: string,
): Record<string, unknown> {
  const record = unsafeCast<Record<string, unknown>>(validated)
  const incoming = unsafeCast<Record<string, unknown>>(record[payloadPath]) ?? {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return record
  }

  const existingPayload = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(existingRow?.data)?.[payloadPath],
  )

  // Pass the existing ciphertext through unchanged. encryptSecretsInRow
  // recognises the encrypted prefix and skips re-encryption.
  const previousSecret = typeof existingPayload?.[secretKey] === 'string' ? existingPayload[secretKey] : ''
  const nextPayload: Record<string, unknown> = { ...incoming, [secretKey]: previousSecret }
  return { ...record, [payloadPath]: nextPayload }
}

function encryptSecretsInRow(section: SettingsSection, row: Record<string, unknown>): Record<string, unknown> {
  const configs = SECRET_FIELDS.filter((f) => f.section === section)
  if (configs.length === 0) {
    return row
  }
  const next: Record<string, unknown> = { ...row }
  for (const config of configs) {
    const bucket = unsafeCast<Record<string, unknown> | undefined>(next[config.path])
    if (!bucket) {
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
