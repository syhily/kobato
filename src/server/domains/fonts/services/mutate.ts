import { eq, inArray } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { FontRow } from '@/server/infra/db/schema/font'
import type { FontsSettings } from '@/shared/config/types'
import type { FontSlot } from '@/shared/contracts/fonts'

import { deleteFontPackage } from '@/server/domains/fonts/storage'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { font } from '@/server/infra/db/schema/font'
import { DomainError } from '@/server/infra/http/errors'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Mutation side of the fonts domain: slot assignment and direct delete. No
// automatic GC on slot edits — a font stays in the library until the user
// deletes it via the trash icon.

/** Read the current `fonts` settings section within the caller's transaction. */
async function readCurrentFonts(db: Database): Promise<FontsSettings> {
  const row = findSettingByScope(db, SECTION_REGISTRY.fonts.scope)
  const data = row?.data
  if (data) {
    const parsed = SECTION_REGISTRY.fonts.schema.safeParse(data)
    if (parsed.success) {
      return parsed.data
    }
  }
  // Fall back to defaults when the row is missing or stale.
  return unsafeCast<FontsSettings>(SECTION_REGISTRY.fonts.defaults)
}

/** Set a slot's ordered font-id list (add/remove/reorder). Pure settings write — font packages are never touched. */
export async function setFontSlot(
  db: Database,
  slot: FontSlot,
  fontIds: readonly string[],
  updatedBy: number | null,
): Promise<void> {
  const current = await readCurrentFonts(db)
  const next: FontsSettings = {
    ...current,
    [slot]: [...fontIds],
  }
  await updateBlogSettingsSection(db, 'fonts', next, updatedBy)
}

/** Delete a font (storage package + DB row); 409 if any slot still references it. */
export async function deleteFont(db: Database, fontId: string): Promise<FontRow> {
  const row = await db.select().from(font).where(eq(font.id, fontId)).limit(1)
  const target = row[0]
  if (!target) {
    throw new DomainError('NOT_FOUND', '字体不存在')
  }
  const current = await readCurrentFonts(db)
  const using: string[] = []
  if (current.global.includes(fontId)) {
    using.push('global')
  }
  if (current.post.includes(fontId)) {
    using.push('post')
  }
  if (current.code.includes(fontId)) {
    using.push('code')
  }
  if (using.length > 0) {
    throw new DomainError(
      'CONFLICT',
      `字体仍被以下槽位引用：${using.join('、')}。请先在 /admin/library/fonts 中将其从这些槽位移除。`,
    )
  }
  await gcFonts(db, [fontId])
  return target
}

/** Hard-delete font rows + storage packages. Storage delete is best-effort — the row delete proceeds regardless. */
async function gcFonts(db: Database, fontIds: readonly string[]): Promise<void> {
  if (fontIds.length === 0) {
    return
  }
  const rows = await db
    .select()
    .from(font)
    .where(inArray(font.id, [...fontIds]))
  for (const row of rows) {
    try {
      await deleteFontPackage(row.hash, row.storageDriver)
    } catch {
      // best-effort — the row delete below is what actually frees the slot
    }
    await db.delete(font).where(eq(font.id, row.id))
  }
}
