import type { DetailPostShell, DraftMarker, Post } from '@kobato/catalog/model.ts'
import type { Database } from '@kobato/db/database.ts'
import type { ViewerIdentity } from '@kobato/server/domains/auth/rbac.ts'

import { toClientPost, toDetailPostShell } from '@kobato/catalog/projection.ts'
import { loadDraftPreviewBySlug } from '@kobato/server/domains/content/lifecycle.ts'
import { canonicalPostPath } from '@kobato/server/domains/content/urls.ts'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter.ts'
import { findPostBySlug } from '@kobato/server/domains/posts/services/single.ts'
import { redirectPermanent } from '@kobato/server/infra/http/redirects.ts'
import { notFound } from '@kobato/server/infra/http/status.ts'

export interface PostPreviewResult {
  sourcePost: Post
  post: DetailPostShell
  /** `draft` means the controller must NOT carry or honour a published ETag:
   *  a swapped draft body can share the stale `published_at` stamp, so the
   *  published tag would wrongly answer 304. */
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
}): Promise<PostPreviewResult> {
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
    notFound()
  }

  const clientPost = toClientPost(sourcePost)
  const canonical = canonicalPostPath(slug, clientPost.slug)
  if (canonical !== undefined) {
    redirectPermanent(canonical)
  }

  return { sourcePost, post: toDetailPostShell(clientPost), draftMarker }
}
