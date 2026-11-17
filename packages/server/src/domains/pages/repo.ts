import { desc } from 'drizzle-orm'

import type { NewPageMeta, PageMetaRow } from '../../infra/db/types'

import { page as pageMetaTable } from '../../infra/db/schema/page'
import {
  buildMetaListWhere,
  makeMetaCrud,
  makeMetaListQueries,
  type MetaListFiltersBase,
} from '../content/entities/meta-repo'

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

/** Pages filter exactly the shared admin-list legs — no entity extras. */
export type ListPagesFilters = MetaListFiltersBase

// CRUD + admin-list queries come from the shared factories bound to the page table.
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
