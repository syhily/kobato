import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { ContentType } from '@/server/domains/content/schemas/revision'
import type { AdminListEngagement } from '@/server/domains/content/services/admin-list'
import type { Database } from '@/server/infra/db/database'
import type { ContentRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'
import type { RoleOrNull } from '@/shared/utils/roles'

/**
 * The 17 columns the `post` and `page` meta tables declare identically.
 * Entity extras (post: visible/categoryId/alias/pinnedAt, page:
 * showFriends) never appear here — they attach through the descriptor's
 * `mutations.insertExtras` / `mutations.updateExtras` hooks. Structural
 * (like `LiveMeta` in `content/schemas/live-gate.ts`), so both row types satisfy it.
 */
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
  publishedAt: Date
  publishedRevisionId: number | null
  firstPublishedAt: Date | null
  authorId: number | null
}

/**
 * The shared upsert-meta input fields (mirrors `MetaRowBase`'s writable
 * shared columns). Entity inputs extend this with their extras — see
 * `UpsertPostMetaInput` / `UpsertPageMetaInput`.
 */
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
  /** `null` cancels a pending schedule (drops back to unpublished); omitted = leave untouched. */
  publishedAt?: Date | null
}

/**
 * Meta-table persistence behind the descriptor. One implementation
 * (`makeMetaCrud` in `entities/meta-repo.ts`) serves both entities; the
 * descriptor wires the bindings through the entity's own surface modules
 * so unit tests keep their per-entity mock seams.
 */
// Sync returns (node:sqlite): these run inside entity transactions.
export interface MetaCrud<TMeta extends MetaRowBase, TNew> {
  findMetaById: (db: Database, id: number) => TMeta | null
  findMetaBySlug: (db: Database, slug: string) => TMeta | null
  findMetaBySlugForUpdate: (db: Database, slug: string) => TMeta | null
  /** Slug lookup that excludes soft-deleted rows (public read path). */
  findPublicMetaBySlug: (db: Database, slug: string) => TMeta | null
  insertMeta: (db: Database, values: TNew) => TMeta
  updateMetaById: (db: Database, id: number, patch: Partial<Omit<TNew, 'id' | 'createdAt'>>) => TMeta | null
  /** Stamps `deleted_at`; false when the row was already deleted. */
  softDeleteMeta: (db: Database, id: number) => boolean
  restoreMeta: (db: Database, id: number) => boolean
}

/** `adminExtras` source: upsert mutations carry the input (tags live there); unpublish reads relations from the DB. */
export type MutationExtrasSource<TInput> = { kind: 'upsert'; input: TInput } | { kind: 'unpublish' }

/** Meta-mutation events that flow through `mutations.afterMutation`. Restore reports through `afterRestore` instead. */
export type MetaMutationEvent = 'create' | 'update' | 'delete' | 'unpublish'

/**
 * One descriptor per meta entity drives BOTH the body lifecycle
 * (`ContentEntityAdapter` via `makeContentEntityAdapter`) and the meta
 * CRUD skeleton (`makeEntityMutations`, `makeEntityAdminQuery`) in
 * `content/entities/*`; posts and pages keep only this declaration plus
 * their genuinely-specific services.
 */
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
  /** Chinese entity label for DomainError messages ('文章' / '页面'). */
  label: string
  repos: MetaCrud<TMeta, TNew>
  /** Applied by the admin list when `filters.limit` is undefined (posts 20, pages 100). */
  defaultAdminListLimit: number

  access: {
    /**
     * The entity's access gate, shared by the body lifecycle, the meta
     * mutations, and the admin queries. Throws the entity's NOT_FOUND
     * (posts also enforce author ownership via `canEditPost`).
     */
    assertAccess: (meta: TMeta | null, viewer?: ViewerIdentity) => asserts meta is TMeta
    /** Draft-preview access rule (CONTEXT.md "Draft preview"): posts author+, pages admin only. */
    canPreviewDraft: (role: RoleOrNull | undefined) => boolean
    /**
     * Narrow the admin-list filters for a non-admin viewer. Posts pin
     * authors to their own posts; pages omit the hook (admin-only
     * surface, no scoping).
     */
    scopeListFilters?: <TFilters>(filters: TFilters, viewer: ViewerIdentity) => TFilters
  }

  audit: {
    /** Logger scope for the force-overwrite audit line ('audit.cms.posts' / 'audit.cms.pages'). */
    loggerScope: string
    metaIdKey: 'postMetaId' | 'pageMetaId'
  }

  preview: {
    /** Catalog projection of meta + revision (toCmsPost / toCmsPage). */
    project: (meta: TMeta, revision: ContentRow | null) => TPreview
    /** Post-publish side effects: invalidation for both entities; posts also refresh the search index. */
    afterPublish: (db: Database, meta: TMeta, body: PortableTextBody, warnings: string[]) => Promise<void>
  }

  adminDto: {
    /** Admin DTO projection of a meta row (+ engagement/list/detail extras). */
    project: (
      row: TMeta & { authorName?: string | null },
      options?: Partial<AdminListEngagement> & Partial<TExtras>,
    ) => TAdminDto
    /** Batch extras for the admin list (posts: tag + category names), keyed by row id. */
    loadListExtras?: (db: Database, rows: TMeta[]) => Promise<Map<number, TExtras>>
    /** Extras for the admin detail projection (posts: tag + category names). */
    loadDetailExtras?: (db: Database, meta: TMeta) => Promise<TExtras>
  }

  mutations: {
    /** Create-time author override — posts pin non-admin viewers to themselves. */
    resolveAuthorId?: (authorId: number | null, viewer?: ViewerIdentity) => number | null
    /** Pre-transaction validation shared by create + update (posts: category existence pre-flight). */
    preflightUpsert?: (db: Database, input: TInput) => Promise<void>
    /** Entity INSERT columns beyond the shared set (post: visible/pinnedAt/categoryId/alias; page: showFriends). */
    insertExtras: (input: TInput) => Partial<TNew>
    /** Entity UPDATE columns beyond the shared set, with `existing` supplying the ?? fallbacks. */
    updateExtras: (input: TInput, existing: TMeta) => Partial<TNew>
    /** In-transaction relation writes after the meta row write (posts: seed/resolve/link tags). */
    syncRelations?: (tx: Database, metaId: number, input: TInput) => void
    /** In-transaction relation teardown on delete, before the slug-registry row goes (posts: search-index row). */
    deleteRelations?: (tx: Database, metaId: number) => void
    /** DTO extras after a mutation (posts: tags + category name). */
    mutationExtras?: (db: Database, meta: TMeta, source: MutationExtrasSource<TInput>) => Promise<TExtras>
    /**
     * Post-commit side effects. Pages invalidate on every event; posts
     * only on delete/unpublish (create/update of an unpublished row
     * change no public surface) and drop the search-index row on
     * unpublish.
     */
    afterMutation?: (db: Database, meta: TMeta, event: MetaMutationEvent) => Promise<void>
    /**
     * In-transaction restore gathering (posts: the published body for
     * re-indexing, collected inside the tx so a failed restore never
     * touches the external index). Runs after the slug reclaim.
     */
    prepareRestore?: (tx: Database, meta: TMeta) => TRestore | null
    /** Post-commit restore side effects; may return a warning that follows the slug warning. */
    afterRestore?: (db: Database, ctx: TRestore) => Promise<string | undefined>
  }
}
