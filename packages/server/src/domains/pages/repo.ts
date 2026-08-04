import type { NewPageMeta, PageMetaRow } from '@kobato/server/infra/db/types'

import {
  buildMetaListWhere,
  makeMetaCrud,
  makeMetaListQueries,
  type MetaListFiltersBase,
} from '@kobato/server/domains/content/entities/meta-repo'
import { page as pageMetaTable } from '@kobato/server/infra/db/schema/page'
import { desc } from 'drizzle-orm'

export type PageMetaWithAuthor = PageMetaRow & { authorName: string | null }

/** Pages filter exactly the shared admin-list legs — no entity extras. */
export type ListPagesFilters = MetaListFiltersBase

// Meta-row CRUD + admin list queries come from the shared factories
// (`content/entities/meta-repo.ts`) bound to the page table — no
// page-specific fork of these queries exists.
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
