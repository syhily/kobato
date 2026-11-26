import type { ContentRedirectSignal } from '@kobato/api/contracts/public/content'
import type { DetailPostShell, DraftMarker, Post } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac'

import { toClientPost, toDetailPostShell } from '@kobato/catalog/projection'
import { loadDraftPreviewBySlug } from '@kobato/server/domains/content/lifecycle'
import { canonicalPostPath } from '@kobato/server/domains/content/urls'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug } from '@kobato/server/domains/posts/services/single'
import { contentNotFound } from '@kobato/server/http/content-not-found'

export interface PostPreviewResult {
  sourcePost: Post
  post: DetailPostShell
  draftMarker: DraftMarker
}

export async function loadPostPreview({
  db,
  slug,
  viewer,
}: {
  db: Database
  slug: string
  viewer: ViewerIdentity | null | undefined
}): Promise<PostPreviewResult | ContentRedirectSignal> {
  let sourcePost = (await findPostBySlug(db, slug)) ?? undefined
  let draftMarker: DraftMarker = null

  if (sourcePost === undefined && viewer) {
    const preview = await loadDraftPreviewBySlug(db, postLifecycleAdapter, slug, viewer)
    if (preview !== null) {
      sourcePost = preview.preview
      draftMarker = 'draft'
    }
  }

  if (sourcePost === undefined) {
    contentNotFound()
  }

  const clientPost = toClientPost(sourcePost)
  const canonical = canonicalPostPath(slug, clientPost.slug)
  if (canonical !== undefined) {
    return { kind: 'redirect', to: canonical, status: 301 }
  }

  return { sourcePost, post: toDetailPostShell(clientPost), draftMarker }
}
