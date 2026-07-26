import type { ContentEntityAdapter } from '@/server/domains/content/lifecycle'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { Post } from '@/shared/types/catalog'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { recordForceOverwriteAudit } from '@/server/domains/content/lifecycle'
import { toCmsPost } from '@/server/domains/posts/projection'
import { findPostMetaById, findPublicPostMetaBySlug } from '@/server/domains/posts/repos/single'
import { indexPost } from '@/server/domains/posts/services/search-index'
import { assertOwnPostOr404 } from '@/server/domains/posts/services/shared'
import { getLogger } from '@/server/infra/logger'
import { hasAtLeast } from '@/shared/utils/roles'

const log = getLogger('posts.service')
const auditLog = getLogger('audit.cms.posts')

export const postLifecycleAdapter: ContentEntityAdapter<PostMetaRow, Post> = {
  entityType: 'post',
  findMetaById: findPostMetaById,
  findPublicMetaBySlug: findPublicPostMetaBySlug,
  assertAccess: assertOwnPostOr404,
  canPreviewDraft: (role) => hasAtLeast(role, 'author'),
  getId: (meta) => meta.id,
  getPublishedRevisionId: (meta) => meta.publishedRevisionId,
  projectPreview: (meta, revision) => toCmsPost(meta, revision),
  recordForceOverwrite: (entry) => recordForceOverwriteAudit(auditLog, 'postMetaId', entry),
  async afterPublish(db, meta, body, warnings) {
    await invalidateContent(db, { entity: 'post' })
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
