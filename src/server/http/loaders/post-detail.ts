import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'
import type { DetailPostShell, DraftMarker, Post } from '@/shared/types/catalog'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug } from '@/server/domains/posts/services/single'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'
import { toClientPost, toDetailPostShell } from '@/shared/types/catalog'
import { canonicalPostPath } from '@/shared/utils/paths'

export interface PostPreviewResult {
  /** The full post row — the controller needs `bodyHtml`/`bodyState` and the published revision. */
  sourcePost: Post
  post: DetailPostShell
  /** `draft` means the controller must NOT carry or honour a published ETag:
   *  a swapped draft body can share the stale `published_at` stamp, so the
   *  published tag would wrongly answer 304. */
  draftMarker: DraftMarker
}

// Post-detail pipeline for `content.posts.bySlug`: plain HTTP facts in, thrown Responses
// out (translated by the controller). Branch order: draft fallback → 404 → alias 301.
// Revalidation happens in the controller AFTER the payload is assembled — a slim
// published_at probe cannot know whether the sidebar, tags or likes changed. Draft
// previews never carry a published ETag: `published_at` survives unpublishing and is
// null for first drafts, so it can never identify a draft representation.
export async function loadPostPreview({
  db,
  slug,
  viewer,
}: {
  db: Database
  slug: string
  /** Viewer identity for the draft-preview gate (`undefined`/`null` = anonymous). */
  viewer: ViewerIdentity | null | undefined
}): Promise<PostPreviewResult> {
  let sourcePost = (await findPostBySlug(db, slug)) ?? undefined
  let draftMarker: DraftMarker = null

  if (sourcePost === undefined && viewer) {
    // Ownership lives in the entity's `canPreviewDraft` rule: authors see
    // their own drafts, admins anyone's; everyone else falls through to 404.
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
