import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY, type SettingsSection } from '@/server/domains/settings/sections'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { checkMailReady } from '@/server/infra/email/sender'
import { ENCRYPTION_KEY } from '@/server/infra/env'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isPrivateIp, tryParseUrl } from '@/shared/utils/safe-url'

const log = getLogger('settings.service')

const sectionChangeHandlers = new Map<SettingsSection, (db: NodePgDatabase, pool: Pool) => void | Promise<void>>()

export function registerSectionChangeHandler(
  section: SettingsSection,
  handler: (db: NodePgDatabase, pool: Pool) => void | Promise<void>,
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
      const url = tryParseUrl(website)
      if (!url || url.protocol !== 'https:') {
        throw new DomainError('BAD_REQUEST', '开启 Passkey 需要站点使用 HTTPS 协议')
      }
      const hostname = url.hostname
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        isPrivateIp(hostname)
      ) {
        throw new DomainError(
          'BAD_REQUEST',
          '开启 Passkey 需要站点使用公开可访问的 HTTPS 域名（不能使用 localhost 或 IP 地址）',
        )
      }
    }
  }

  const secretConfig = SECRET_FIELDS.find((f) => f.section === section)
  if (secretConfig && !ENCRYPTION_KEY) {
    throw new DomainError('BAD_REQUEST', 'ENCRYPTION_KEY 环境变量未设置，无法保存包含敏感信息的设置。')
  }

  return db.transaction(async (tx) => {
    const nextRow = await applySectionPatch(tx, section, parsed.data)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    await upsertSetting(tx, encryptedRow, updatedBy, meta.scope)

    const handler = sectionChangeHandlers.get(section)
    if (handler) {
      void Promise.resolve(handler(tx, pool)).catch((e: unknown) =>
        log.error('Section change handler failed', { section, error: String(e) }),
      )
    }

    return refreshBlogSettings(tx)
  })
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
  const secretConfig = SECRET_FIELDS.find((f) => f.section === section)
  if (secretConfig) {
    row = await preserveSecretOnPatch(db, row, section, secretConfig.path, secretConfig.field)
  }
  if (section === 'assets') {
    row = await preserveBrandingOnPatch(db, row)
  }
  return row
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

async function preserveSecretOnPatch(
  db: NodePgDatabase,
  validated: unknown,
  section: SettingsSection,
  payloadPath: string,
  secretKey: string,
): Promise<Record<string, unknown>> {
  const record = validated as Record<string, unknown>
  const incoming = (record[payloadPath] as Record<string, unknown>) ?? {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return record
  }

  const existingRow = await findSettingByScope(db, SECTION_REGISTRY[section].scope)
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
  const config = SECRET_FIELDS.find((f) => f.section === section)
  if (!config) {
    return row
  }
  const bucket = row[config.path] as Record<string, unknown> | undefined
  if (!bucket) {
    return row
  }
  const value = bucket[config.field]
  if (typeof value !== 'string') {
    return row
  }
  return {
    ...row,
    [config.path]: {
      ...bucket,
      [config.field]: encryptIfNeeded(value),
    },
  }
}
