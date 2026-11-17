import type { FontSlot } from '@kobato/contracts/fonts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { FontRow } from '@kobato/db/schema/font.ts'
import type { FontsSettings } from '@kobato/settings/types.ts'

import { findSettingByScope } from '@kobato/db/operations/setting.ts'
import { font } from '@kobato/db/schema/font.ts'
import { deleteFontPackage } from '@kobato/server/domains/fonts/storage.ts'
import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { eq, inArray } from 'drizzle-orm'

// Mutation side of the fonts domain: slot assignment and direct delete. Slot
// edits never garbage-collect a font package — only an explicit delete does.

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
    throw new DomainError('NOT_FOUND', descriptorFor('fonts.error.notFound'))
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
    throw new DomainError('CONFLICT', descriptorFor('fonts.error.inUse', { slots: using.join(', ') }))
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
