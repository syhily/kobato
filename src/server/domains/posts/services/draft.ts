import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { PublishLatestResult, SaveDraftResult } from '@/server/domains/content/schema'
import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'

import { publishLatestRevision, saveDraftRevision } from '@/server/domains/content/repos/mutate'
import { findContentById, findLatestDraft } from '@/server/domains/content/repos/query'
import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { clearContentCaches } from '@/server/domains/content/shared'
import { syncLibraryImageBlocks } from '@/server/domains/pages/services/image-sync'
import { toAdminRevisionDto, toCmsPost, type CmsPost } from '@/server/domains/posts/projection'
import { findPostMetaById, findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { indexPost } from '@/server/domains/posts/services/search-index'
import {
  assertOwnPostOr404,
  type SavePostBodyInput,
  type SavePostResult,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { getLogger } from '@/server/infra/logger'
import { invalidateSearchCache } from '@/server/infra/search/search'
import { deriveSlug } from '@/server/infra/slug'
import { collectInklingHeadings } from '@/shared/inkling/headings'
import { collectInklingImageStoragePaths } from '@/shared/inkling/images'

const log = getLogger('posts.service')
const auditLog = getLogger('audit.cms.posts')

export interface PostDraftPreview {
  post: CmsPost
  hasNewerDraft: boolean
}

export async function loadPostDraftPreviewBySlug(db: NodePgDatabase, slug: string): Promise<PostDraftPreview | null> {
  const meta = await findPublicPostMetaBySlug(db, slug)
  if (meta === null) {
    return null
  }
  const draft = await findLatestDraft(db, 'post', meta.id)
  let revision: ContentRow | null = draft
  if (revision === null && meta.publishedRevisionId !== null) {
    revision = await findContentById(db, meta.publishedRevisionId)
  }
  return { post: toCmsPost(meta, revision), hasNewerDraft: draft !== null }
}

export async function loadEditorBody(
  db: NodePgDatabase,
  id: bigint,
  viewer?: ViewerContext,
): Promise<{
  meta: PostMetaRow
  draft: ContentRow | null
  published: ContentRow | null
}> {
  const meta = await findPostMetaById(db, id)
  assertOwnPostOr404(meta, viewer)
  const [draft, published] = await Promise.all([
    findLatestDraft(db, 'post', meta.id),
    meta.publishedRevisionId === null ? Promise.resolve(null) : findContentById(db, meta.publishedRevisionId),
  ])
  return { meta, draft, published }
}

async function savePostBodyInternal(
  db: NodePgDatabase,
  input: SavePostBodyInput,
  mode: 'draft' | 'publish',
  viewer?: ViewerContext,
): Promise<SavePostResult> {
  const meta = await findPostMetaById(db, input.postId)
  assertOwnPostOr404(meta, viewer)
  const body = await canonicalizeBodyOrThrow(input.body)

  const warnings: string[] = []

  try {
    await syncLibraryImageBlocks(db, body)
  } catch (err: unknown) {
    log.warn('sync library image blocks failed', { postId: input.postId, error: err })
    warnings.push('图片库同步失败，部分图片可能无法正常显示。')
  }

  const imageSources = collectInklingImageStoragePaths(body)
  const headings = collectInklingHeadings(body, deriveSlug)

  const overwriteContext = input.force === true ? await findLatestDraft(db, 'post', meta.id).catch(() => null) : null

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
      ? await saveDraftRevision(db, 'post', repoInput)
      : await publishLatestRevision(db, 'post', { ...repoInput, publishedAt: input.publishedAt })

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
    await clearContentCaches('post', input.postId)
    await invalidateSearchCache().catch((err: unknown) => {
      log.warn('invalidate search cache failed', { postId: input.postId, error: err })
    })
    // Index the canonical body we already have in scope rather than
    // re-reading the row from the DB. The in-scope `body` is freshly
    // canonicalized + prerendered, so it is guaranteed to match the
    // published HTML. Re-reading the row would reintroduce a validation
    // gap (raw JSONB typed as InklingDocument) and cost an extra round-trip.
    try {
      await indexPost(db, meta.id, meta.title, meta.summary, body)
    } catch (err: unknown) {
      log.warn('index post failed', { postId: meta.id, error: err })
      warnings.push('搜索索引更新失败，该文章可能不会出现在搜索结果中。')
    }
  }
  return projectSaveResult(result, warnings.length > 0 ? warnings.join(' ') : undefined)
}

export function saveDraft(
  db: NodePgDatabase,
  input: SavePostBodyInput,
  viewer?: ViewerContext,
): Promise<SavePostResult> {
  return savePostBodyInternal(db, input, 'draft', viewer)
}

export function publishLatest(
  db: NodePgDatabase,
  input: SavePostBodyInput,
  viewer?: ViewerContext,
): Promise<SavePostResult> {
  return savePostBodyInternal(db, input, 'publish', viewer)
}

function projectSaveResult(result: SaveDraftResult | PublishLatestResult, warning?: string): SavePostResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
      warning,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row), warning }
}
