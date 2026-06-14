/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { Setting } from '@/server/infra/db/types'
import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { checkMailReady } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isValidPasskeyDomain } from '@/shared/utils/safe-url'

const log = getLogger('settings.service')

const sectionChangeHandlers = new Map<SettingsSection, (pool: Pool) => void | Promise<void>>()

export function registerSectionChangeHandler(
  section: SettingsSection,
  handler: (pool: Pool) => void | Promise<void>,
): void {
  sectionChangeHandlers.set(section, handler)
}

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
    const securityPayload = parsed.data as { otp?: { enabled?: boolean }; passkey?: { enabled?: boolean } }
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

  const handler = sectionChangeHandlers.get(section)
  if (handler) {
    try {
      await handler(pool)
    } catch (e: unknown) {
      log.error('Section change handler failed', { section, error: String(e) })
    }
  }

  return bundle
}

export interface SecretMasks {
  mailApiKeyMask: string | null
  mailSmtpPassMask: string | null
  assetsSecretAccessKeyMask: string | null
  searchApiKeyMask: string | null
}

export function computeSecretMasks(bundle: BlogSettingsBundle): SecretMasks {
  const mailApiKey = bundle.mail?.mail.apiKey
  const mailSmtpPass = bundle.mail?.mail.smtpPass
  const assetsSecret = bundle.assets?.storage.secretAccessKey
  const searchApiKey = bundle.search?.search.apiKey
  return {
    mailApiKeyMask: typeof mailApiKey === 'string' && mailApiKey !== '' ? mailApiKey.slice(-4) : null,
    mailSmtpPassMask: typeof mailSmtpPass === 'string' && mailSmtpPass !== '' ? mailSmtpPass.slice(-4) : null,
    assetsSecretAccessKeyMask: typeof assetsSecret === 'string' && assetsSecret !== '' ? assetsSecret.slice(-4) : null,
    searchApiKeyMask: typeof searchApiKey === 'string' && searchApiKey !== '' ? searchApiKey.slice(-4) : null,
  }
}

export function redactSecretsFromBundle(bundle: BlogSettingsBundle): BlogSettingsBundle {
  const clone = { ...bundle } as Record<string, unknown>
  for (const { bundleKey, path, field } of SECRET_FIELDS) {
    const section = clone[bundleKey] as Record<string, unknown> | null
    if (section === null) {
      continue
    }
    const bucket = section[path] as Record<string, unknown> | undefined
    if (bucket && typeof bucket[field] === 'string' && bucket[field] !== '') {
      clone[bundleKey] = {
        ...section,
        [path]: { ...bucket, [field]: '' },
      }
    }
  }
  return clone as unknown as BlogSettingsBundle
}

async function applySectionPatch(
  db: NodePgDatabase,
  section: SettingsSection,
  validated: unknown,
): Promise<Record<string, unknown>> {
  let row = validated as Record<string, unknown>
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
  const bucket = row[payloadPath] as Record<string, unknown> | undefined
  return bucket !== undefined && secretKey in bucket && bucket[secretKey] !== undefined
}

async function preserveBrandingOnPatch(
  db: NodePgDatabase,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const existingRow = await findSettingByScope(db, SECTION_REGISTRY.assets.scope)
  const existingBranding = (existingRow?.data as Record<string, unknown> | undefined)?.branding as
    | Record<string, unknown>
    | undefined
  const incomingBranding = row.branding as Record<string, unknown> | undefined
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
  const record = validated as Record<string, unknown>
  const incoming = (record[payloadPath] as Record<string, unknown>) ?? {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return record
  }

  const existingPayload = (existingRow?.data as Record<string, unknown> | undefined)?.[payloadPath] as
    | Record<string, unknown>
    | undefined

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
    const bucket = next[config.path] as Record<string, unknown> | undefined
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
