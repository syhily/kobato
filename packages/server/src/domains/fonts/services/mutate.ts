import type { FontSlot } from '@kobato/contracts/fonts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { FontRow } from '@kobato/db/schema/font.ts'
import type { FontsSettings } from '@kobato/settings/types.ts'

import { findSettingByScope } from '@kobato/db/operations/setting.ts'
import { font } from '@kobato/db/schema/font.ts'
import { deleteFontPackage } from '@kobato/server/domains/fonts/storage.ts'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { eq, inArray } from 'drizzle-orm'

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
    } catch {}
    await db.delete(font).where(eq(font.id, row.id))
  }
}
