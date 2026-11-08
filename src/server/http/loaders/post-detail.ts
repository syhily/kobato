import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'
import type { DetailPostShell, DraftMarker, Post } from '@/shared/types/catalog'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug, findPostEtagInputBySlug } from '@/server/domains/posts/services/single'
import { etagHeaderMatches, notModifiedResponse, postEtag } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'
import { toClientPost, toDetailPostShell } from '@/shared/types/catalog'
import { canonicalPostPath } from '@/shared/utils/paths'

export interface PostPreviewResult {
  /** The full post row — the controller needs `bodyHtml`/`bodyState`. */
  sourcePost: Post
  post: DetailPostShell
  /** `null` on draft previews — they must never revalidate against (or
   *  stamp) the published ETag; see the re-check below. */
  etag: string | null
  draftMarker: DraftMarker
}

// Post-detail pipeline for `content.posts.bySlug`: plain HTTP facts in,
// thrown Responses out (translated by the controller). Branch order:
// ETag probe 304 → draft fallback → 404 → alias 301 → full ETag re-check
// (drafts skip both ETag paths — the published ETag must not 304 a swapped
// body).
export async function loadPostPreview({
  db,
  slug,
  viewer,
  ifNoneMatch,
}: {
  db: Database
  slug: string
  /** Viewer identity for the draft-preview gate (`undefined`/`null` = anonymous). */
  viewer: ViewerIdentity | null | undefined
  ifNoneMatch: string | null | undefined
}): Promise<PostPreviewResult> {
  // Slim ETag probe answers repeat requests before the full load; alias
  // hits fall through so the canonical 301 still fires.
  const etagInput = await findPostEtagInputBySlug(db, slug)
  if (etagInput?.slug === slug) {
    const probeEtag = postEtag(etagInput.id, etagInput.publishedAt)
    if (etagHeaderMatches(ifNoneMatch, probeEtag)) {
      throw notModifiedResponse(probeEtag)
    }
  }

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

  const post = toDetailPostShell(clientPost)

  // Draft previews carry no public ETag. `post.updated` maps `published_at`
  // — a stale go-live stamp that survives unpublishing (and is null for
  // never-published drafts), so revalidating here would answer 304 against
  // the browser-cached PUBLISHED page (or a constant, never-invalidating
  // etag for first drafts) and serve the wrong body.
  if (draftMarker === null) {
    // Same builder as the early probe above (id + publishedAt) — probe and
    // full share `postEtag`, so repeat visits keep hitting the same 304.
    const etag = postEtag(clientPost.id, post.updated)
    if (etagHeaderMatches(ifNoneMatch, etag)) {
      throw notModifiedResponse(etag)
    }
    return { sourcePost, post, etag, draftMarker }
  }
  return { sourcePost, post, etag: null, draftMarker }
}
