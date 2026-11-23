import type { Database } from '@kobato/db/sqlite/database'
import type { NewPageMeta, PageMetaRow } from '@kobato/db/sqlite/types'

import {
  findEntityMetaById,
  findEntityMetaBySlug,
  findPublicEntityMetaBySlug,
  insertEntityMeta,
  restoreEntityMeta,
  softDeleteEntityMeta,
  updateEntityMetaById,
} from '@kobato/db/sqlite/operations/content/entity-meta'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

export const findPageMetaById = (db: Database, id: number): PageMetaRow | null =>
  unsafeCast<PageMetaRow | null>(findEntityMetaById(db, 'page', id))

export const findPageMetaBySlug = (db: Database, slug: string): PageMetaRow | null =>
  unsafeCast<PageMetaRow | null>(findEntityMetaBySlug(db, 'page', slug))

export const findPageMetaBySlugForUpdate = (db: Database, slug: string): PageMetaRow | null =>
  unsafeCast<PageMetaRow | null>(findEntityMetaBySlug(db, 'page', slug))

export const findPublicPageMetaBySlug = (db: Database, slug: string): PageMetaRow | null =>
  unsafeCast<PageMetaRow | null>(findPublicEntityMetaBySlug(db, 'page', slug))

export const insertPageMeta = (db: Database, values: NewPageMeta): PageMetaRow =>
  unsafeCast<PageMetaRow>(insertEntityMeta(db, 'page', values))

export const updatePageMetaById = (
  db: Database,
  id: number,
  patch: Partial<Omit<NewPageMeta, 'id' | 'createdAt'>>,
): PageMetaRow | null => unsafeCast<PageMetaRow | null>(updateEntityMetaById(db, 'page', id, patch))

export const softDeletePageMeta = (db: Database, id: number): boolean => softDeleteEntityMeta(db, 'page', id)

export const restorePageMeta = (db: Database, id: number): boolean => restoreEntityMeta(db, 'page', id)
