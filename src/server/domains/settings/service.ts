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
// just return the validated payload verbatim; the `mail` and `assets`
// sections fold in the existing secret when the editor omits it (see
// comments below).
async function applySectionPatch(
  section: SettingsSection,
  validated: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (section === 'mail') {
    return applyMailPatch(validated)
  }
  if (section === 'assets') {
    return applyAssetsPatch(validated)
  }
  if (section === 'search') {
    return applySearchPatch(validated)
  }
  return validated
}

async function applyMailPatch(validated: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Preserve the existing API key when the editor omits the field:
  // the admin form sends `apiKey: undefined` whenever the input is
  // left blank, which means "I'm tweaking other fields, don't make
  // me re-paste the secret". Only an explicit string value (even
  // empty) intentionally overwrites the stored key. The conflict
  // domain is the `blog.mail` row only — a concurrent edit to
  // `blog.cache` cannot wipe the API key.
  const incomingMail = (validated.mail as Record<string, unknown>) ?? {}
  if ('apiKey' in incomingMail && incomingMail.apiKey !== undefined) {
    return validated
  }

  const existingRow = await findSettingByScope(SECTION_REGISTRY.mail.scope)
  const existingMail = (existingRow?.data as Record<string, unknown> | undefined)?.mail as
    | Record<string, unknown>
    | undefined
  const nextMail: Record<string, unknown> = { ...incomingMail, apiKey: existingMail?.apiKey ?? '' }
  return { mail: nextMail }
}

async function applyAssetsPatch(validated: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Same "optional ⇒ keep existing" semantics as mail.apiKey, but for
  // `storage.secretAccessKey`. Editor sends `undefined` to mean "I'm
  // tweaking other fields, don't make me re-paste the secret"; an
  // explicit string (including empty) overwrites the stored secret.
  // Folding the previous secret back in keeps the persisted row
  // self-consistent regardless of whether the master upload toggle
  // is currently ON or OFF.
  const incomingStorage = (validated.storage as Record<string, unknown>) ?? {}
  if ('secretAccessKey' in incomingStorage && incomingStorage.secretAccessKey !== undefined) {
    return validated
  }

  const existingRow = await findSettingByScope(SECTION_REGISTRY.assets.scope)
  const existingStorage = (existingRow?.data as Record<string, unknown> | undefined)?.storage as
    | Record<string, unknown>
    | undefined
  const previousSecret = typeof existingStorage?.secretAccessKey === 'string' ? existingStorage.secretAccessKey : ''
  const nextStorage: Record<string, unknown> = {
    ...incomingStorage,
    secretAccessKey: previousSecret,
  }
  return { ...validated, storage: nextStorage }
}

async function applySearchPatch(validated: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Preserve the existing OpenAI API key when the editor omits the field.
  const incomingSearch = (validated.search as Record<string, unknown>) ?? {}
  if ('apiKey' in incomingSearch && incomingSearch.apiKey !== undefined) {
    return validated
  }

  const existingRow = await findSettingByScope(SECTION_REGISTRY.search.scope)
  const existingSearch = (existingRow?.data as Record<string, unknown> | undefined)?.search as
    | Record<string, unknown>
    | undefined
  const nextSearch: Record<string, unknown> = {
    ...incomingSearch,
    apiKey: typeof existingSearch?.apiKey === 'string' ? existingSearch.apiKey : '',
  }
  return { search: nextSearch }
}
