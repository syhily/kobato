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

// The post-detail read pipeline behind `content.posts.bySlug`. HTTP facts
// arrive as plain values (`role`, the raw `ifNoneMatch` header) so the
// procedure layer stays transport-agnostic; the thrown redirect/304/404
// Responses are translated into the procedure's discriminated-union output
// by the controller. Every historical branch is preserved:
//
//   slim ETag probe → 304 (before the full load ever runs; alias hits fall
//                       through so the canonical 301 still fires)
//   live miss → role-gated draft preview (`canPreviewDraft`: author+)
//   still missing → 404
//   alias hit → 301 to the canonical slug
//   full ETag re-check → 304 (same builder as the probe — probe and full
//                       share `postEtag`, so their inputs cannot drift)
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
  /** Raw If-None-Match header value. */
  ifNoneMatch: string | null | undefined
}): Promise<PostPreviewResult> {
  // Cheap ETag probe: a repeat request whose If-None-Match still matches
  // is answered from one slim meta read, before the full load below
  // (meta+revision join, tags, category, image hydration) ever runs. The
  // probe inputs — id + publishedAt — are exactly the ETag parts recomputed
  // on the full path (both sites call the shared `postEtag` builder).
  // Alias hits carry a different slug and fall through to the full load so
  // the canonical 301 still fires.
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
