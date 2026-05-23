import type { PublishLatestResult, SaveDraftResult } from '@/server/domains/pages/repo'
import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import {
  findContentById,
  findLatestDraft,
  publishLatestRevision,
  saveDraftRevision,
} from '@/server/domains/content/repo'
import { canonicalizeBodyOrThrow } from '@/server/domains/content/save-helpers'
import { syncLibraryImageBlocks } from '@/server/domains/pages/image-sync'
import { indexPost } from '@/server/domains/posts/indexer'
import { toAdminRevisionDto, toCmsPost, type CmsPost } from '@/server/domains/posts/projection'
import { findPostMetaById, findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import {
  assertOwnPostOr404,
  clearPostMetasCache,
  type SavePostBodyInput,
  type SavePostResult,
  type ViewerContext,
} from '@/server/domains/posts/services/shared'
import { getLogger } from '@/server/infra/logger'
import { deriveSlug } from '@/server/infra/slug'
import { collectHeadings, collectImageStoragePaths } from '@/shared/pt/utils'

const log = getLogger('posts.service')
const auditLog = getLogger('audit.cms.posts')

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

  const overwriteContext = input.force === true ? await findLatestDraft('post', meta.id).catch(() => null) : null

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
    await clearPostMetasCache()
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
