import type { FontSlot } from '@kobato/api/contracts/fonts'
import type { Database } from '@kobato/db/sqlite/database'
import type { FontRow } from '@kobato/db/sqlite/schema/font'
import type { FontsSettings } from '@kobato/settings/types'

import { deleteFontRowById, findFontById, findFontRowsByIds } from '@kobato/db/sqlite/operations/system/font'
import { findSettingByScope } from '@kobato/db/sqlite/operations/system/setting'
import { deleteFontPackage } from '@kobato/server/domains/fonts/storage'
import { updateBlogSettingsSection } from '@kobato/server/domains/settings/services/core'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
  const target = await findFontById(db, fontId)
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
  const rows = await findFontRowsByIds(db, fontIds)
  for (const row of rows.values()) {
    try {
      await deleteFontPackage(row.hash, row.storageDriver)
    } catch {}
    await deleteFontRowById(db, row.id)
  }
}
