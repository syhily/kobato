import { access } from 'node:fs/promises'
import path from 'node:path'

import type { FontsInput } from '@/server/domains/settings/schemas/fonts'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { rescheduleArchive } from '@/server/domains/audit/scheduler'
import { rescheduleBackup } from '@/server/domains/backup/scheduler'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY, type SettingsSection } from '@/server/domains/settings/sections'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { decryptIfNeeded, encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { FONT_PATH } from '@/server/infra/env'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('settings.service')

// DTO returned by the admin "get settings" endpoint. The codebase no
// longer ships a `BlogConstants` block — date fields (`locale`,
// `timeZone`, `timeFormat`) live on the `general` section and the
// `asset` host / S3 storage / upload limits live on the `assets`
// section. The DTO can be `null` only on a deployment that has not
// been installed yet, but in practice the install gate already
// redirected the request away from the admin shell, so callers may
// safely treat `null` as a programmer error.
//
// The on-disk shape is bucketed (`BlogSettingsBundle`) and the admin
// layout forwards a strengthened (non-null-per-section) projection to
// each child form through the outlet context. Per-section forms read
// `bundle.footer`, `bundle.cache`, etc., so nothing here needs the
// legacy aggregated view anymore.
export interface AdminBlogSettingsDto {
  bundle: BlogSettingsBundle | null
}

export async function getAdminBlogSettings(): Promise<AdminBlogSettingsDto> {
  // Delegates to the snapshot hydrator, which re-reads from DB when the
  // Redis version counter has advanced (set by `refreshBlogSettings`
  // after every admin write) or shares an in-flight promise otherwise.
  const bundle = await hydrateBlogSettings()
  return { bundle }
}

// Apply a section-scoped patch by writing ONLY the row that owns the
// section. Each section has its own `setting('blog.<section>')` row, so
// concurrent edits to different sections never read, merge, or
// overwrite each other's JSONB. The on-disk row is the validated
// payload verbatim — no nested merge with the rest of the document.
export async function updateBlogSettingsSection<S extends SettingsSection>(
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
  // Extra runtime validation for fonts: make sure referenced files exist
  // on disk before committing the setting row.
  if (section === 'fonts') {
    await validateFontPaths(parsed.data as FontsInput)
  }

  const nextRow = await applySectionPatch(section, parsed.data)

  encryptSecretsInPlace(section, nextRow)
  await upsertSetting(nextRow, updatedBy, meta.scope)

  if (section === 'backup') {
    void rescheduleBackup().catch((e) => log.error('rescheduleBackup failed', { error: String(e) }))
  }

  if (section === 'limits') {
    void rescheduleArchive().catch((e) => log.error('rescheduleArchive failed', { error: String(e) }))
  }

  return refreshBlogSettings()
}

// --- Internal helpers ------------------------------------------------------

// Build the row's `data` payload for the given section. Most sections
// just return the validated payload verbatim; `mail`, `assets`, and
// `search` fold in the existing secret when the editor omits it. The
// `assets` section additionally preserves `branding` (managed by the
// /admin/branding/upload endpoints, never sent through this PATCH).
async function applySectionPatch(section: SettingsSection, validated: unknown): Promise<Record<string, unknown>> {
  let row = validated as Record<string, unknown>
  const secretConfig = SECRET_FIELDS.find((f) => f.section === section)
  if (secretConfig) {
    row = await preserveSecretOnPatch(row, section, secretConfig.path, secretConfig.field)
  }
  if (section === 'assets') {
    row = await preserveBrandingOnPatch(row)
  }
  return row
}

// Merge the persisted `branding` map into the assets row before upsert.
// The admin form only sends `robotsTxt` through the settings PATCH —
// asset uploads (SVG/binary) go through `/admin/branding/upload` and
// write their ObjectRefs directly. We have to splice the persisted
// ObjectRefs back in, then layer the patch on top, so neither side
// wipes the other.
async function preserveBrandingOnPatch(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existingRow = await findSettingByScope(SECTION_REGISTRY.assets.scope)
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

// When the editor omits a secret field (sends `undefined`), fold the
// previous secret back in so the user doesn't have to re-paste it.
// An explicit string (including empty) overwrites the stored value.
async function preserveSecretOnPatch(
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

  const existingRow = await findSettingByScope(SECTION_REGISTRY[section].scope)
  const existingPayload = (existingRow?.data as Record<string, unknown> | undefined)?.[payloadPath] as
    | Record<string, unknown>
    | undefined

  // Decrypt the stored secret before returning it to the admin UI
  const raw = typeof existingPayload?.[secretKey] === 'string' ? existingPayload[secretKey] : ''
  const previousSecret = decryptIfNeeded(raw as string)
  const nextPayload: Record<string, unknown> = { ...incoming, [secretKey]: previousSecret }
  return { ...record, [payloadPath]: nextPayload }
}

// Encrypt secret fields in-place before writing to the DB.
function encryptSecretsInPlace(section: SettingsSection, row: Record<string, unknown>): void {
  const config = SECRET_FIELDS.find((f) => f.section === section)
  if (!config) {
    return
  }
  const bucket = row[config.path] as Record<string, unknown> | undefined
  if (!bucket) {
    return
  }
  const value = bucket[config.field]
  if (typeof value === 'string') {
    bucket[config.field] = encryptIfNeeded(value)
  }
}

// Validate that every configured Canvas font path resolves to an existing
// file inside FONT_PATH. Called during admin settings save so the operator
// gets immediate feedback instead of a silent render-time fallback.
async function validateFontPaths(data: FontsInput): Promise<void> {
  if (!FONT_PATH) {
    // If FONT_PATH is not configured, any non-empty font path is unusable.
    if (data.og.path !== '' || data.calendar.path !== '') {
      throw new DomainError('BAD_REQUEST', 'FONT_PATH 环境变量未设置，无法配置本地字体路径')
    }
    return
  }

  const basePath = path.resolve(FONT_PATH)
  const slots: Array<{ name: string; relativePath: string }> = [
    { name: 'OG 图字体', relativePath: data.og.path },
    { name: '日历图字体', relativePath: data.calendar.path },
  ]

  for (const { name, relativePath } of slots) {
    if (relativePath === '') {
      continue
    }

    const fullPath = path.resolve(basePath, relativePath)
    const relativeToBase = path.relative(basePath, fullPath)
    if (relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) {
      throw new DomainError('BAD_REQUEST', `${name} 路径穿越不被允许: ${relativePath}`)
    }

    try {
      await access(fullPath)
    } catch {
      throw new DomainError('BAD_REQUEST', `${name} 文件不存在或无法访问: ${relativePath}`)
    }
  }
}
