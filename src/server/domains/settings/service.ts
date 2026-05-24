import type { BlogSettingsBundle } from '@/shared/config/blog'

import { rescheduleArchive } from '@/server/domains/audit/scheduler'
import { rescheduleBackup } from '@/server/domains/backup/scheduler'
import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY, type SettingsSection } from '@/server/domains/settings/sections'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { decryptIfNeeded, encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
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
// `search` fold in the existing secret when the editor omits it.
async function applySectionPatch(section: SettingsSection, validated: unknown): Promise<Record<string, unknown>> {
  const secretConfig = SECRET_FIELDS.find((f) => f.section === section)
  if (!secretConfig) {
    return validated as Record<string, unknown>
  }
  return preserveSecretOnPatch(validated, section, secretConfig.path, secretConfig.field)
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
