import { eq } from 'drizzle-orm'

import type { PublishLatestResult, SaveDraftResult } from '@/server/domains/pages/repo'
import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import { canEditPost, type ViewerContext as RbacViewerContext } from '@/server/domains/auth/rbac'
import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { isCatalogVisible } from '@/server/domains/content/schema'
import { syncLibraryImageBlocks } from '@/server/domains/pages/image-sync'
import { indexPost, removePostIndex } from '@/server/domains/posts/indexer'
import {
  toAdminPostDto,
  toAdminRevisionDto,
  toCmsPost,
  type AdminPostDetailDto,
  type AdminPostDto,
  type AdminRevisionDto,
  type CmsPost,
} from '@/server/domains/posts/projection'
import {
  countPostMetas,
  findContentById,
  findContentsByIds,
  findLatestDraft,
  findLatestRevision,
  findPostMetaById,
  findPostMetaBySlug,
  findPublicPostMetaBySlug,
  listPostMetas,
  listPublicPostMetas,
  listRevisions,
  publishLatestRevision,
  restorePostMeta,
  saveDraftRevision,
  softDeletePostMeta,
  updatePostMetaById,
  type ListPostsFilters,
} from '@/server/domains/posts/repo'
import { resolveSlugForTaxonomy } from '@/server/domains/taxonomies/shared'
import { createProcessCache } from '@/server/infra/cache/process-cache'
import { commentCountsByOwnerIds, metricsByOwnerIds } from '@/server/infra/db/operations/like'
import { ensureMetricsBatch } from '@/server/infra/db/operations/metric'
import { seedTagIfMissing } from '@/server/infra/db/operations/tag'
import { db } from '@/server/infra/db/pool'
import { post as postMetaTable } from '@/server/infra/db/schema'
import { DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

const log = getLogger('posts.service')
const auditLog = getLogger('audit.cms.posts')

/** Auto-create any tags that don't already exist in the database. */
async function ensureTagsExist(tagNames: string[], tx = db): Promise<void> {
  if (tagNames.length === 0) {
    return
  }
  await Promise.all(
    tagNames.map((name) => seedTagIfMissing({ name, slug: resolveSlugForTaxonomy(undefined, name) }, tx)),
  )
}

// --- Public catalog helpers -------------------------------------------------

// Process-level cache for catalog post metas. Cleared on admin writes
// via `clearPostMetasCache()`. See `infra/cache/process-cache` for the
// multi-process caveat.
const postMetaCache = createProcessCache<CmsPost[]>({ ttlMs: 10_000 })

function clearPostMetasCache(): void {
  postMetaCache.clear()
}

export async function loadCatalogPostMetas(): Promise<CmsPost[]> {
  const cached = postMetaCache.get()
  if (cached !== null) {
    return cached.map((p) => ({ ...p }))
  }

  const contentSettings = requireBlogSettingsSection('content')
  const sortBy = contentSettings.post.sortBy ?? 'publishedAt'
  const metas = await listPublicPostMetas(sortBy)
  const asOf = new Date()
  const visible = metas.filter((meta) => isCatalogVisible(meta, asOf))
  if (visible.length === 0) {
    return []
  }
  const revisionIds = visible.map((m) => m.publishedRevisionId).filter((id): id is bigint => id !== null)
  const revisionMap = new Map<bigint, ContentRow>()
  if (revisionIds.length > 0) {
    const rows = await findContentsByIds(revisionIds)
    for (const row of rows) {
      revisionMap.set(row.id, row)
    }
  }
  const result = visible.map((meta) => {
    const revision = meta.publishedRevisionId === null ? null : (revisionMap.get(meta.publishedRevisionId) ?? null)
    return toCmsPost(meta, revision)
  })

  postMetaCache.set(result)
  return result.map((p) => ({ ...p }))
}

export async function loadCatalogPostBySlug(slug: string): Promise<CmsPost | null> {
  const meta = await findPublicPostMetaBySlug(slug)
  if (meta === null || !isCatalogVisible(meta)) {
    return null
  }
  const revision = meta.publishedRevisionId === null ? null : await findContentById(meta.publishedRevisionId)
  return toCmsPost(meta, revision)
}

// --- Draft preview ----------------------------------------------------------

export interface PostDraftPreview {
  post: CmsPost
  hasNewerDraft: boolean
}

export async function loadPostDraftPreviewBySlug(slug: string): Promise<PostDraftPreview | null> {
  const meta = await findPublicPostMetaBySlug(slug)
  if (meta === null) {
    return null
  }
  const draft = await findLatestDraft('post', meta.id)
  let revision: ContentRow | null = draft
  if (revision === null && meta.publishedRevisionId !== null) {
    revision = await findContentById(meta.publishedRevisionId)
  }
  return { post: toCmsPost(meta, revision), hasNewerDraft: draft !== null }
}

// --- Admin list / get -------------------------------------------------------

export type ViewerContext = RbacViewerContext

export interface AdminPostsListResult {
  posts: AdminPostDto[]
  total: number
  hasMore: boolean
}

export async function listPostsForAdmin(
  filters: ListPostsFilters = {},
  viewer?: ViewerContext,
): Promise<AdminPostsListResult> {
  let appliedFilters = filters
  if (viewer && viewer.role !== 'admin') {
    appliedFilters = { ...filters, authorId: BigInt(viewer.userId) }
  }
  const offset = appliedFilters.offset ?? 0
  const limit = appliedFilters.limit ?? 20
  const [rows, total] = await Promise.all([
    listPostMetas({ ...appliedFilters, limit, offset }),
    countPostMetas(appliedFilters),
  ])
  if (rows.length === 0) {
    return { posts: [], total, hasMore: false }
  }
  // Ensure every listed post has a `metric` row so the admin
  // comment-count link can compose `?pageKey=<publicId>` even before
  // the post has been visited publicly. The upsert is idempotent and
  // batched in a single SQL statement.
  const ownerIds = rows.map((row) => row.id)
  await ensureMetricsBatch(rows.map((row) => ({ type: 'post', ownerId: row.id })))
  const [metrics, countRows] = await Promise.all([
    metricsByOwnerIds('post', ownerIds),
    commentCountsByOwnerIds('post', ownerIds),
  ])
  const publicIdByOwner = new Map(metrics.map((m) => [String(m.ownerId), m.publicId]))
  const countByOwner = new Map(countRows.map((r) => [String(r.ownerId), r.count]))
  return {
    posts: rows.map((row) =>
      toAdminPostDto(row, {
        commentCount: countByOwner.get(String(row.id)) ?? 0,
        commentPublicId: publicIdByOwner.get(String(row.id)) ?? '',
      }),
    ),
    total,
    hasMore: offset + rows.length < total,
  }
}

function assertOwnPostOr404(meta: PostMetaRow | null, viewer?: ViewerContext): asserts meta is PostMetaRow {
  if (!meta) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
  if (viewer && !canEditPost(viewer, meta)) {
    throw new DomainError('NOT_FOUND', ErrorMessages.NOT_FOUND)
  }
}

export async function getPostDetailForAdmin(id: bigint, viewer?: ViewerContext): Promise<AdminPostDetailDto | null> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const [latest, published] = await Promise.all([
    findLatestRevision('post', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(meta.publishedRevisionId),
  ])
  return {
    post: toAdminPostDto(meta),
    latestRevision: latest === null ? null : toAdminRevisionDto(latest),
    publishedRevision: published === null ? null : toAdminRevisionDto(published),
  }
}

export async function listRevisionsForAdmin(id: bigint, viewer?: ViewerContext): Promise<AdminRevisionDto[]> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const rows = await listRevisions('post', id)
  return rows.map(toAdminRevisionDto)
}

// --- Admin metadata CRUD ----------------------------------------------------

const RESERVED_POST_SLUGS = new Set<string>([
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

const SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export interface UpsertPostMetaInput {
  id?: bigint
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  /**
   * Opt the post into rendering the「修改于 XXXX」secondary timestamp
   * on the public detail page. Defaults `false` on create.
   */
  showUpdated?: boolean
  visible?: boolean
  pinnedAt?: Date | null
  category?: string
  tags?: string[]
  alias?: string[]
  publishedAt?: Date
}

function ensureSlugLegal(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new DomainError('BAD_REQUEST', '文章 slug 格式不合法（仅允许小写字母、数字、`-` `_` `.`）。')
  }
  if (slug.length > 80) {
    throw new DomainError('BAD_REQUEST', '文章 slug 长度不得超过 80 个字符。')
  }
  if (RESERVED_POST_SLUGS.has(slug)) {
    throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`)
  }
}

function resolveSlugForPost(explicit: string | undefined, title: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim()
  }
  const derived = deriveSlug(title)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从标题推导出 slug，请手动填写。', [
      { message: '标题推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}

export async function createPost(
  input: UpsertPostMetaInput,
  authorId: bigint | null,
  viewer?: ViewerContext,
): Promise<AdminPostDto> {
  let resolvedAuthorId = authorId
  if (viewer && viewer.role !== 'admin') {
    resolvedAuthorId = BigInt(viewer.userId)
  }
  const slug = resolveSlugForPost(input.slug, input.title)
  ensureSlugLegal(slug)
  const collision = await findPostMetaBySlug(slug)
  if (collision !== null) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
  }
  const now = new Date()
  const row = await db.transaction(async (tx) => {
    await ensureTagsExist(input.tags ?? [], tx)
    const [inserted] = await tx
      .insert(postMetaTable)
      .values({
        slug,
        title: input.title,
        summary: input.summary ?? '',
        cover: input.cover ?? '',
        og: input.og ?? null,
        published: false,
        commentsEnabled: input.commentsEnabled ?? true,
        showToc: input.showToc ?? false,
        showUpdated: input.showUpdated ?? false,
        visible: input.visible ?? true,
        pinnedAt: input.pinnedAt === undefined ? null : input.pinnedAt,
        category: input.category ?? '',
        tags: input.tags ?? [],
        alias: input.alias ?? [],
        publishedAt: input.publishedAt ?? now,
        authorId: resolvedAuthorId,
      })
      .returning()
    return inserted
  })
  clearPostMetasCache()
  return toAdminPostDto(row)
}

export async function updatePostMeta(input: UpsertPostMetaInput, viewer?: ViewerContext): Promise<AdminPostDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePostMeta requires an id')
  }
  const id = input.id
  const slug = resolveSlugForPost(input.slug, input.title)
  ensureSlugLegal(slug)
  const existing = await findPostMetaById(id)
  assertOwnPostOr404(existing, viewer)
  if (existing.slug !== slug) {
    const collision = await findPostMetaBySlug(slug)
    if (collision !== null && collision.id !== id) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }
  }
  const updated = await db.transaction(async (tx) => {
    await ensureTagsExist(input.tags ?? [], tx)
    const [result] = await tx
      .update(postMetaTable)
      .set({
        slug,
        title: input.title,
        summary: input.summary ?? existing.summary,
        cover: input.cover ?? existing.cover,
        og: input.og === undefined ? existing.og : input.og,
        commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
        showToc: input.showToc ?? existing.showToc,
        showUpdated: input.showUpdated ?? existing.showUpdated,
        visible: input.visible ?? existing.visible,
        pinnedAt: input.pinnedAt === undefined ? existing.pinnedAt : input.pinnedAt,
        category: input.category ?? existing.category,
        tags: input.tags ?? existing.tags,
        alias: input.alias ?? existing.alias,
        publishedAt: input.publishedAt ?? existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(postMetaTable.id, id))
      .returning()
    return result ?? null
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
  }
  clearPostMetasCache()
  return toAdminPostDto(updated)
}

export async function deletePost(id: bigint, viewer?: ViewerContext): Promise<{ deleted: boolean }> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const deleted = await softDeletePostMeta(id)
  if (deleted) {
    clearPostMetasCache()
    await removePostIndex(id).catch((err: unknown) => {
      log.warn('remove post index failed', { postId: id, error: err })
    })
  }
  return { deleted }
}

export async function restorePost(id: bigint, viewer?: ViewerContext): Promise<{ restored: boolean }> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const restored = await restorePostMeta(id)
  if (restored) {
    clearPostMetasCache()
    const meta = await findPostMetaById(id)
    if (meta !== null && meta.published && meta.publishedRevisionId !== null) {
      const revision = await findContentById(meta.publishedRevisionId)
      if (revision !== null) {
        await indexPost(meta.id, meta.title, meta.summary, revision.body as PortableTextBody).catch((err: unknown) => {
          log.warn('index post failed', { postId: meta.id, error: err })
        })
      }
    }
  }
  return { restored }
}

export async function unpublishPost(id: bigint, viewer?: ViewerContext): Promise<AdminPostDto> {
  const existing = await findPostMetaById(id)
  assertOwnPostOr404(existing, viewer)
  const updated = await updatePostMetaById(id, { published: false })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '文章不存在或已被删除。')
  }
  clearPostMetasCache()
  await removePostIndex(id).catch((err: unknown) => {
    log.warn('remove post index failed', { postId: id, error: err })
  })
  return toAdminPostDto(updated)
}

// --- Save / publish ---------------------------------------------------------

export interface SavePostBodyInput {
  postId: bigint
  body: unknown
  expectedClientRevisionToken?: string | null
  force?: boolean
  authorId: bigint | null
  publishedAt?: Date
}

export type SavePostResult =
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      expectedToken: string
    }

async function savePostBodyInternal(
  input: SavePostBodyInput,
  mode: 'draft' | 'publish',
  viewer?: ViewerContext,
): Promise<SavePostResult> {
  const meta = await findPostMetaById(input.postId)
  assertOwnPostOr404(meta, viewer)
  const body = await canonicalizeBodyOrThrow(input.body)
  await syncLibraryImageBlocks(body).catch((err: unknown) => {
    log.warn('sync library image blocks failed', { postId: input.postId, error: err })
  })
  const imageSources = collectImageStoragePaths(body)
  const headings = collectHeadings(body, deriveSlug)

  const overwriteContext = input.force === true ? await findLatestRevision('post', meta.id).catch(() => null) : null

  const repoInput = {
    ownerId: meta.id,
    body,
    imageSources,
    headings,
    authorId: input.authorId,
    expectedClientRevisionToken: input.expectedClientRevisionToken,
    force: input.force,
  }

  const result =
    mode === 'draft'
      ? await saveDraftRevision('post', repoInput)
      : await publishLatestRevision('post', { ...repoInput, publishedAt: input.publishedAt })

  const wroteSuccessfully = result.status === 'saved' || result.status === 'published'
  if (input.force === true && wroteSuccessfully && overwriteContext !== null) {
    if (
      input.expectedClientRevisionToken === undefined ||
      input.expectedClientRevisionToken !== overwriteContext.clientRevisionToken
    ) {
      auditLog.info('force_overwrite_save', {
        mode,
        actor: input.authorId === null ? null : input.authorId.toString(),
        postMetaId: meta.id.toString(),
        overwrittenRevisionId: overwriteContext.id.toString(),
        overwrittenRevisionToken: overwriteContext.clientRevisionToken,
        clientExpectedToken: input.expectedClientRevisionToken ?? null,
        resultRevisionId: result.row.id.toString(),
      })
    }
  }
  if (mode === 'publish' && wroteSuccessfully) {
    clearPostMetasCache()
    const publishedRevision = await findContentById(result.row.id)
    if (publishedRevision !== null) {
      const postMeta = await findPostMetaById(input.postId)
      if (postMeta !== null) {
        await indexPost(
          postMeta.id,
          postMeta.title,
          postMeta.summary,
          publishedRevision.body as PortableTextBody,
        ).catch((err: unknown) => {
          log.warn('index post failed', { postId: postMeta.id, error: err })
        })
      }
    }
  }
  return projectSaveResult(result)
}

export function saveDraft(input: SavePostBodyInput, viewer?: ViewerContext): Promise<SavePostResult> {
  return savePostBodyInternal(input, 'draft', viewer)
}

export function publishLatest(input: SavePostBodyInput, viewer?: ViewerContext): Promise<SavePostResult> {
  return savePostBodyInternal(input, 'publish', viewer)
}

function projectSaveResult(result: SaveDraftResult | PublishLatestResult): SavePostResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row) }
}

// --- Re-exports -------------------------------------------------------------

export type { AdminPostDetailDto, AdminPostDto, AdminRevisionDto, CmsPost } from '@/server/domains/posts/projection'

export async function loadEditorBody(
  id: bigint,
  viewer?: ViewerContext,
): Promise<{
  meta: PostMetaRow
  draft: ContentRow | null
  published: ContentRow | null
}> {
  const meta = await findPostMetaById(id)
  assertOwnPostOr404(meta, viewer)
  const [draft, published] = await Promise.all([
    findLatestDraft('post', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(meta.publishedRevisionId),
  ])
  return { meta, draft, published }
}
