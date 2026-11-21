import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type { Database } from '@kobato/db/database'
import type { ContentRow } from '@kobato/db/types'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'
import type { ContentType } from '@kobato/server/domains/content/schemas/revision'
import type { AdminListEngagement } from '@kobato/server/domains/content/services/admin-list'

export interface MetaRowBase {
  id: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  slug: string
  title: string
  summary: string
  cover: string
  og: string | null
  published: boolean
  commentsEnabled: boolean
  webmentionsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  contentLanguage: string | null
  publishedAt: Date
  publishedRevisionId: number | null
  firstPublishedAt: Date | null
  authorId: number | null
}

export interface UpsertMetaInputBase {
  id?: number
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  webmentionsEnabled?: boolean
  showToc?: boolean
  showUpdated?: boolean
  /** `null` clears the content language; omitted = leave untouched. */
  contentLanguage?: string | null
  /** `null` cancels a pending schedule (drops back to unpublished); omitted = leave untouched. */
  publishedAt?: Date | null
}

export interface MetaCrud<TMeta extends MetaRowBase, TNew> {
  findMetaById: (db: Database, id: number) => TMeta | null
  findMetaBySlug: (db: Database, slug: string) => TMeta | null
  findMetaBySlugForUpdate: (db: Database, slug: string) => TMeta | null
  findPublicMetaBySlug: (db: Database, slug: string) => TMeta | null
  insertMeta: (db: Database, values: TNew) => TMeta
  updateMetaById: (db: Database, id: number, patch: Partial<Omit<TNew, 'id' | 'createdAt'>>) => TMeta | null
  softDeleteMeta: (db: Database, id: number) => boolean
  restoreMeta: (db: Database, id: number) => boolean
}

export type MutationExtrasSource<TInput> = { kind: 'upsert'; input: TInput } | { kind: 'unpublish' }

export type MetaMutationEvent = 'create' | 'update' | 'delete' | 'unpublish'

export interface MetaEntityDescriptor<
  TMeta extends MetaRowBase,
  TNew,
  TInput extends UpsertMetaInputBase,
  TExtras extends object,
  TAdminDto,
  TPreview,
  TRestore = undefined,
> {
  entityType: ContentType
  repos: MetaCrud<TMeta, TNew>
  defaultAdminListLimit: number

  access: {
    assertAccess: (meta: TMeta | null, viewer?: ViewerIdentity) => asserts meta is TMeta
    canPreviewDraft: (viewer: ViewerIdentity | undefined, meta: TMeta) => boolean
    scopeListFilters?: <TFilters>(filters: TFilters, viewer: ViewerIdentity) => TFilters
  }

  audit: {
    loggerScope: string
    metaIdKey: 'postMetaId' | 'pageMetaId'
  }

  preview: {
    project: (meta: TMeta, revision: ContentRow | null) => TPreview
    afterPublish: (
      db: Database,
      meta: TMeta,
      body: LexicalEditorState,
      warnings: ErrorMessageDescriptor[],
    ) => Promise<void>
  }

  adminDto: {
    project: (
      row: TMeta & { authorName?: string | null },
      options?: Partial<AdminListEngagement> & Partial<TExtras>,
    ) => TAdminDto
    loadListExtras?: (db: Database, rows: TMeta[]) => Promise<Map<number, TExtras>>
    loadDetailExtras?: (db: Database, meta: TMeta) => Promise<TExtras>
  }

  mutations: {
    resolveAuthorId?: (authorId: number | null, viewer?: ViewerIdentity) => number | null
    preflightUpsert?: (db: Database, input: TInput) => Promise<void>
    insertExtras: (input: TInput) => Partial<TNew>
    updateExtras: (input: TInput, existing: TMeta) => Partial<TNew>
    syncRelations?: (tx: Database, metaId: number, input: TInput) => void
    deleteRelations?: (tx: Database, metaId: number) => void
    mutationExtras?: (db: Database, meta: TMeta, source: MutationExtrasSource<TInput>) => Promise<TExtras>
    afterMutation?: (db: Database, meta: TMeta, event: MetaMutationEvent) => Promise<void>
    prepareRestore?: (tx: Database, meta: TMeta) => TRestore | null
    afterRestore?: (db: Database, ctx: TRestore) => Promise<ErrorMessageDescriptor | undefined>
  }
}
