import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq, inArray } from 'drizzle-orm'

import type { FontRow } from '@/server/infra/db/schema/font'
import type { FontsSettings } from '@/shared/config/types'
import type { FontSlot } from '@/shared/types/fonts'

import { referenceCount, type SlotSnapshot } from '@/server/domains/fonts/slot-gc'
import { deleteFontPackage } from '@/server/domains/fonts/storage'
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { font } from '@/server/infra/db/schema/font'
import { DomainError } from '@/server/infra/http/errors'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Mutation side of the fonts domain: slot assignment and direct delete (for
// fonts the user explicitly removes from the library). There is **no
// automatic GC on slot edits** — a font stays in the library (storage +
// DB row) until the user deletes it via the trash icon. This keeps slot
// mutations side-effect-free and race-free under concurrent edits.

/**
 * Read the current `fonts` settings section from the DB (within the caller's
 * transaction). Used to compute GC candidates against the *current* slot
 * snapshot before the upsert overwrites it.
 */
async function readCurrentFonts(db: NodePgDatabase): Promise<FontsSettings> {
  const row = await findSettingByScope(db, SECTION_REGISTRY.fonts.scope)
  const data = row?.data
  if (data) {
    const parsed = SECTION_REGISTRY.fonts.schema.safeParse(data)
    if (parsed.success) {
      return parsed.data
    }
  }
  // Fall back to defaults if the row is missing or stale (e.g. pre-migration
  // JSON carrying the old `globalCss` keys). The schema defaults every slot
  // to `[]`, which is a safe starting point.
  return unsafeCast<FontsSettings>(SECTION_REGISTRY.fonts.defaults)
}

function snapshotFromSettings(settings: FontsSettings): SlotSnapshot {
  return { global: settings.global, post: settings.post, code: settings.code }
}

/**
 * Set a slot's ordered font-id list. One endpoint covers add, remove, and
 * reorder. Pure settings write — the referenced font packages are never
 * touched here; removal from a slot only unassigns it, leaving the package
 * in the library for the user to delete explicitly.
 */
export async function setFontSlot(
  db: NodePgDatabase,
  pool: Pool,
  slot: FontSlot,
  fontIds: readonly string[],
  updatedBy: bigint | null,
): Promise<void> {
  const current = await readCurrentFonts(db)
  const next: FontsSettings = {
    ...current,
    [slot]: [...fontIds],
  }
  await updateBlogSettingsSection(db, pool, 'fonts', next, updatedBy)
}

/**
 * Delete a font (storage package + DB row). Refuses with 409 if any slot
 * still references it — the user must detach it from every slot first.
 */
export async function deleteFont(db: NodePgDatabase, fontId: string): Promise<FontRow> {
  const row = await db.select().from(font).where(eq(font.id, fontId)).limit(1)
  const target = row[0]
  if (!target) {
    throw new DomainError('NOT_FOUND', '字体不存在')
  }
  const current = await readCurrentFonts(db)
  const count = referenceCount(snapshotFromSettings(current), fontId)
  if (count > 0) {
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
    throw new DomainError(
      'CONFLICT',
      `字体仍被以下槽位引用：${using.join('、')}。请先在 /admin/library/fonts 中将其从这些槽位移除。`,
    )
  }
  await gcFonts(db, [fontId])
  return target
}

/**
 * Hard-delete a set of font rows + their storage packages. Best-effort on
 * the storage side: a missing object is logged but does not roll back the
 * row delete (the DB row is the source of truth for "this font exists").
 */
async function gcFonts(db: NodePgDatabase, fontIds: readonly string[]): Promise<void> {
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
