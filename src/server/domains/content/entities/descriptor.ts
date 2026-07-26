import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { ContentType } from '@/server/domains/content/schemas/revision'
import type { AdminListEngagement } from '@/server/domains/content/services/admin-list'
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
  id: bigint
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
  showToc: boolean
  showUpdated: boolean
  publishedAt: Date
  publishedRevisionId: bigint | null
  firstPublishedAt: Date | null
  authorId: bigint | null
}

/**
 * The shared upsert-meta input fields (mirrors `MetaRowBase`'s writable
 * shared columns). Entity inputs extend this with their extras — see
 * `UpsertPostMetaInput` / `UpsertPageMetaInput`.
 */
export interface UpsertMetaInputBase {
  id?: bigint
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  showUpdated?: boolean
  publishedAt?: Date
}

/**
 * Meta-table persistence behind the descriptor. One implementation
 * (`makeMetaCrud` in `entities/meta-repo.ts`) serves both entities; the
 * descriptor wires the bindings through the entity's own surface modules
 * (`posts/services/single` + `posts/repos/write`, `pages/repo`) so unit
 * tests keep their per-entity mock seams.
 */
export interface MetaCrud<TMeta extends MetaRowBase, TNew> {
  findMetaById: (db: NodePgDatabase, id: bigint) => Promise<TMeta | null>
  findMetaBySlug: (db: NodePgDatabase, slug: string) => Promise<TMeta | null>
  findMetaBySlugForUpdate: (db: NodePgDatabase, slug: string) => Promise<TMeta | null>
  /** Slug lookup that excludes soft-deleted rows (public read path). */
  findPublicMetaBySlug: (db: NodePgDatabase, slug: string) => Promise<TMeta | null>
  insertMeta: (db: NodePgDatabase, values: TNew) => Promise<TMeta>
  updateMetaById: (
    db: NodePgDatabase,
    id: bigint,
    patch: Partial<Omit<TNew, 'id' | 'createdAt'>>,
  ) => Promise<TMeta | null>
  /** Stamps `deleted_at`; false when the row was already deleted. */
  softDeleteMeta: (db: NodePgDatabase, id: bigint) => Promise<boolean>
  restoreMeta: (db: NodePgDatabase, id: bigint) => Promise<boolean>
}

/** `adminExtras` source: upsert mutations carry the input (tags live there); unpublish reads relations from the DB. */
export type MutationExtrasSource<TInput> = { kind: 'upsert'; input: TInput } | { kind: 'unpublish' }

/** Meta-mutation events that flow through `mutations.afterMutation`. Restore reports through `afterRestore` instead. */
export type MetaMutationEvent = 'create' | 'update' | 'delete' | 'unpublish'

/**
 * One descriptor per meta entity drives BOTH the body lifecycle
 * (`ContentEntityAdapter` via `makeContentEntityAdapter`) and the meta
 * CRUD skeleton (`makeEntityMutations`, `makeEntityAdminQuery`). The
 * generic implementations live in `content/entities/*`; posts and pages
 * keep only this declaration plus their genuinely-specific services
 * (taxonomy, search indexing, public queries, feed).
 *
 * Everything entity-specific attaches here:
 * - posts: RBAC ownership gate, author+ draft preview, tag/category
 *   relations, visible/pinned/alias columns, search-index side effects.
 * - pages: existence-only access, admin-only draft preview, showFriends,
 *   invalidation on every meta mutation.
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
    afterPublish: (db: NodePgDatabase, meta: TMeta, body: PortableTextBody, warnings: string[]) => Promise<void>
  }

  adminDto: {
    /** Admin DTO projection of a meta row (+ engagement/list/detail extras). */
    project: (
      row: TMeta & { authorName?: string | null },
      options?: Partial<AdminListEngagement> & Partial<TExtras>,
    ) => TAdminDto
    /** Batch extras for the admin list (posts: tag + category names), keyed by row id. */
    loadListExtras?: (db: NodePgDatabase, rows: TMeta[]) => Promise<Map<bigint, TExtras>>
    /** Extras for the admin detail projection (posts: tag + category names). */
    loadDetailExtras?: (db: NodePgDatabase, meta: TMeta) => Promise<TExtras>
  }

  mutations: {
    /** Create-time author override — posts pin non-admin viewers to themselves. */
    resolveAuthorId?: (authorId: bigint | null, viewer?: ViewerIdentity) => bigint | null
    /** Pre-transaction validation shared by create + update (posts: category existence pre-flight). */
    preflightUpsert?: (db: NodePgDatabase, input: TInput) => Promise<void>
    /** Entity INSERT columns beyond the shared set (post: visible/pinnedAt/categoryId/alias; page: showFriends). */
    insertExtras: (input: TInput) => Partial<TNew>
    /** Entity UPDATE columns beyond the shared set, with `existing` supplying the ?? fallbacks. */
    updateExtras: (input: TInput, existing: TMeta) => Partial<TNew>
    /** In-transaction relation writes after the meta row write (posts: seed/resolve/link tags). */
    syncRelations?: (tx: NodePgDatabase, metaId: bigint, input: TInput) => Promise<void>
    /** In-transaction relation teardown on delete, before the slug-registry row goes (posts: search-index row). */
    deleteRelations?: (tx: NodePgDatabase, metaId: bigint) => Promise<void>
    /** DTO extras after a mutation (posts: tags + category name). */
    mutationExtras?: (db: NodePgDatabase, meta: TMeta, source: MutationExtrasSource<TInput>) => Promise<TExtras>
    /**
     * Post-commit side effects. Pages invalidate on every event; posts
     * only on delete/unpublish (create/update of an unpublished row
     * change no public surface) and drop the search-index row on
     * unpublish.
     */
    afterMutation?: (db: NodePgDatabase, meta: TMeta, event: MetaMutationEvent) => Promise<void>
    /**
     * In-transaction restore gathering (posts: the published body for
     * re-indexing, collected inside the tx so a failed restore never
     * touches the external index). Runs after the slug reclaim.
     */
    prepareRestore?: (tx: NodePgDatabase, meta: TMeta) => Promise<TRestore>
    /** Post-commit restore side effects; may return a warning that follows the slug warning. */
    afterRestore?: (db: NodePgDatabase, ctx: TRestore) => Promise<string | undefined>
  }
}
