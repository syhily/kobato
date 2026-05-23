import type { BlogSettingsBundle } from '@/shared/config/blog'

import { SECTION_REGISTRY, type SettingsSection } from '@/server/domains/settings/sections'
import { hydrateBlogSettings, refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { DomainError } from '@/server/infra/http/errors'

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
  // Always re-hydrate when the admin panel loads so the editor sees the
  // latest committed state, even if another tab just wrote to the row.
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
  const validated = parsed.data as Record<string, unknown>

  const nextRow = await applySectionPatch(section, validated)
  await upsertSetting(nextRow, updatedBy, meta.scope)

  // The backup scheduler is only needed when the backup section is edited.
  // Keeping it as a dynamic import avoids pulling the scheduler (and its
  // transitive dependency on the backup service) into the settings module's
  // static dependency graph, which keeps test files that touch settings
  // lighter when they do not exercise backup logic.
  if (section === 'backup') {
    const { rescheduleBackup } = await import('@/server/domains/backup/scheduler')
    rescheduleBackup()
  }

  if (section === 'limits') {
    const { rescheduleArchive } = await import('@/server/domains/audit/scheduler')
    rescheduleArchive()
  }

  return refreshBlogSettings()
}

// --- Internal helpers ------------------------------------------------------

// Build the row's `data` payload for the given section. Most sections
// just return the validated payload verbatim; `mail`, `assets`, and
// `search` fold in the existing secret when the editor omits it.
async function applySectionPatch(
  section: SettingsSection,
  validated: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const secretConfig = SECRET_PRESERVE_CONFIG[section]
  if (!secretConfig) {
    return validated
  }
  return preserveSecretOnPatch(validated, section, secretConfig.payloadPath, secretConfig.secretKey)
}

// Sections where the admin form sends `undefined` for a secret field to
// mean "keep the existing value". Maps section → { nested payload path,
// secret key name }.
const SECRET_PRESERVE_CONFIG: Partial<Record<SettingsSection, { payloadPath: string; secretKey: string }>> = {
  mail: { payloadPath: 'mail', secretKey: 'apiKey' },
  assets: { payloadPath: 'storage', secretKey: 'secretAccessKey' },
  search: { payloadPath: 'search', secretKey: 'apiKey' },
}

// When the editor omits a secret field (sends `undefined`), fold the
// previous secret back in so the user doesn't have to re-paste it.
// An explicit string (including empty) overwrites the stored value.
async function preserveSecretOnPatch(
  validated: Record<string, unknown>,
  section: SettingsSection,
  payloadPath: string,
  secretKey: string,
): Promise<Record<string, unknown>> {
  const incoming = (validated[payloadPath] as Record<string, unknown>) ?? {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return validated
  }

  const existingRow = await findSettingByScope(SECTION_REGISTRY[section].scope)
  const existingPayload = (existingRow?.data as Record<string, unknown> | undefined)?.[payloadPath] as
    | Record<string, unknown>
    | undefined

  const previousSecret = typeof existingPayload?.[secretKey] === 'string' ? existingPayload[secretKey] : ''
  const nextPayload: Record<string, unknown> = { ...incoming, [secretKey]: previousSecret }
  return { ...validated, [payloadPath]: nextPayload }
}
