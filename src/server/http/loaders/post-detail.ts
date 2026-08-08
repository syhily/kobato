import type { Database } from '@/server/infra/db/database'
import type { DetailPostShell, DraftMarker, Post } from '@/shared/types/catalog'
import type { RoleOrNull } from '@/shared/utils/roles'

import { loadDraftPreviewBySlug } from '@/server/domains/content/lifecycle'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug, findPostEtagInputBySlug } from '@/server/domains/posts/services/single'
import { etagHeaderMatches, notModifiedResponse, postEtag } from '@/server/infra/http/etag'
import { redirectPermanent } from '@/server/infra/http/redirects'
import { notFound } from '@/server/infra/http/status'
import { toClientPost, toDetailPostShell } from '@/shared/types/catalog'
import { canonicalPostPath } from '@/shared/utils/paths'

export interface PostPreviewResult {
  /** The full post row — the controller still needs `body` and `imageSources`. */
  sourcePost: Post
  post: DetailPostShell
  etag: string
  draftMarker: DraftMarker
}

// Post-detail pipeline for `content.posts.bySlug`: plain HTTP facts in,
// thrown Responses out (translated by the controller). Branch order:
// ETag probe 304 → draft fallback → 404 → alias 301 → full ETag re-check.
export async function loadPostPreview({
  db,
  slug,
  role,
  ifNoneMatch,
}: {
  db: Database
  slug: string
  /** Viewer role for the draft-preview gate (`undefined`/`null` = anonymous). */
  role: RoleOrNull | undefined
  ifNoneMatch: string | null | undefined
}): Promise<PostPreviewResult> {
  // Slim ETag probe answers repeat requests before the full load; alias
  // hits fall through so the canonical 301 still fires.
  const etagInput = await findPostEtagInputBySlug(db, slug)
  if (etagInput !== null && etagInput.slug === slug) {
    const probeEtag = postEtag(etagInput.id, etagInput.publishedAt)
    if (etagHeaderMatches(ifNoneMatch, probeEtag)) {
      throw notModifiedResponse(probeEtag)
    }
  }

  let sourcePost = (await findPostBySlug(db, slug)) ?? undefined
  let draftMarker: DraftMarker = null

  if (sourcePost === undefined && postLifecycleAdapter.canPreviewDraft(role)) {
    const preview = await loadDraftPreviewBySlug(db, postLifecycleAdapter, slug)
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

  // Same builder as the early probe above (id + publishedAt) — probe and
  // full share `postEtag`, so repeat visits keep hitting the same 304.
  const etag = postEtag(clientPost.id, post.updated)
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    throw notModifiedResponse(etag)
  }

  return { sourcePost, post, etag, draftMarker }
}
