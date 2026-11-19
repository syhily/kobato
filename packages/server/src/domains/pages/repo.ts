import type { NewPageMeta, PageMetaRow } from '@kobato/db/types.ts'

import { page as pageMetaTable } from '@kobato/db/schema/page.ts'
import {
  buildMetaListWhere,
  makeMetaCrud,
  makeMetaListQueries,
  type MetaListFiltersBase,
} from '@kobato/server/domains/content/entities/meta-repo.ts'
import { desc } from 'drizzle-orm'

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

export type ListPagesFilters = MetaListFiltersBase

const crud = makeMetaCrud<PageMetaRow, NewPageMeta>(pageMetaTable)

export const findPageMetaById = crud.findMetaById
export const findPageMetaBySlug = crud.findMetaBySlug
export const findPageMetaBySlugForUpdate = crud.findMetaBySlugForUpdate
export const insertPageMeta = crud.insertMeta
export const updatePageMetaById = crud.updateMetaById
export const softDeletePageMeta = crud.softDeleteMeta
export const restorePageMeta = crud.restoreMeta

const listQueries = makeMetaListQueries<PageMetaRow, ListPagesFilters>(pageMetaTable, {
  buildWhere: (filters) => buildMetaListWhere(pageMetaTable, filters),
  orderBy: () => desc(pageMetaTable.updatedAt),
})

export const listPageMetas = listQueries.listMetas
export const countPageMetas = listQueries.countMetas
