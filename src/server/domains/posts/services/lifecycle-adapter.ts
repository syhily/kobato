import type { ContentEntityAdapter, ForceOverwriteEntry } from '@/server/domains/content/lifecycle'
import type { PostMetaRow } from '@/server/infra/db/types'

import { clearContentCaches } from '@/server/domains/content/shared'
import { toCmsPost, type CmsPost } from '@/server/domains/posts/projection'
import { findPostMetaById, findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { indexPost } from '@/server/domains/posts/services/search-index'
import { assertOwnPostOr404 } from '@/server/domains/posts/services/shared'
import { getLogger } from '@/server/infra/logger'
import { invalidateSearchCache } from '@/server/infra/search/search'

const log = getLogger('posts.service')
const auditLog = getLogger('audit.cms.posts')

export const postLifecycleAdapter: ContentEntityAdapter<PostMetaRow, CmsPost> = {
  entityType: 'post',
  findMetaById: findPostMetaById,
  findPublicMetaBySlug: findPublicPostMetaBySlug,
  assertAccess: assertOwnPostOr404,
  getId: (meta) => meta.id,
  getPublishedRevisionId: (meta) => meta.publishedRevisionId,
  projectPreview: (meta, revision) => toCmsPost(meta, revision),
  recordForceOverwrite(entry: ForceOverwriteEntry<PostMetaRow>): void {
    auditLog.info('force_overwrite_save', {
      mode: entry.mode,
      actor: entry.authorId === null ? null : entry.authorId.toString(),
      postMetaId: entry.meta.id.toString(),
      overwrittenRevisionId: entry.overwritten.id.toString(),
      overwrittenRevisionToken: entry.overwritten.clientRevisionToken,
      clientExpectedToken: entry.expectedClientRevisionToken ?? null,
      resultRevisionId: entry.resultRow.id.toString(),
    })
  },
  async afterPublish(db, meta, body, warnings) {
    await clearContentCaches('post', meta.id)
    await invalidateSearchCache().catch((err: unknown) => {
      log.warn('invalidate search cache failed', { postId: meta.id, error: err })
    })
    // Index the canonical body already in scope rather than re-reading the
    // row from the DB: `body` is freshly canonicalized + prerendered, so it
    // matches what `publishLatestRevision` persisted — a re-read would only
    // cost a round-trip and reintroduce a validation gap (raw JSONB).
    try {
      await indexPost(db, meta.id, meta.title, meta.summary, body)
    } catch (err: unknown) {
      log.warn('index post failed', { postId: meta.id, error: err })
      warnings.push('搜索索引更新失败，该文章可能不会出现在搜索结果中。')
    }
  },
}
