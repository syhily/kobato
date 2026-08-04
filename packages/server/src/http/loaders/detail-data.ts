import type { MusicEmbedResolver } from '@kobato/server/domains/lexical/embeds'
import type { PublicDetailData } from '@kobato/server/http/loaders/detail'
import type { RequestContext } from '@kobato/server/http/request-context'
import type { Database } from '@kobato/server/infra/db/database'
import type { LexicalBody } from '@kobato/shared/lexical/schema'
import type { DraftMarker } from '@kobato/shared/types/catalog'
import type { ResolvedImageMeta } from '@kobato/shared/types/images'
import type { MusicPlayerBlockMeta } from '@kobato/shared/types/music'
import type { Role } from '@kobato/shared/utils/roles'

import { loadDraftPreviewBySlug } from '@kobato/server/domains/content/lifecycle'
import { listAllFriends } from '@kobato/server/domains/friends/service'
import { resolveImageMetaBySources } from '@kobato/server/domains/images/services/enhance'
import { getPublicMusicMetasByIds } from '@kobato/server/domains/music/services/read'
import { selectSidebarPosts } from '@kobato/server/domains/posts/services/featured'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter'
import { findPostBySlug } from '@kobato/server/domains/posts/services/single'
import { getTagsByNames, listAllTags } from '@kobato/server/domains/taxonomies/tags/service'
import { loadPublicDetailData } from '@kobato/server/http/loaders/detail'
import { loadPagePreview } from '@kobato/server/http/loaders/page-preview'
import { selectSidebarTags } from '@kobato/server/http/loaders/sidebar-select'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { getSidebarWidgetCount } from '@kobato/shared/config/utils'
import { collectMusicPlayerIds } from '@kobato/shared/lexical/walk'
import { toClientPost, toDetailPostShell } from '@kobato/shared/types/catalog'
import { resolveFootnotesSectionTitle } from '@kobato/shared/utils/footnotes-section-title'
import { idFromString } from '@kobato/shared/utils/id'

/**
 * Page-assembly data for the public detail routes, shared between the
 * route loaders (today) and the headless Content API procedures (the
 * split). Extraction keeps the two surfaces bit-identical — the
 * procedures wrap exactly what SSR renders.
 *
 * Control flow is expressed in the return value, not thrown redirects:
 *   - `null`           → not found (route answers 404; procedure NOT_FOUND)
 *   - `canonicalSlug`  → set when the requested slug was an alias; the
 *     frontend replays the 301 (`wire.slug !== urlSlug`, v8 key-flow
 *     design) so SEO semantics survive the headless split
 * ETag handling stays in the route loader (HTTP-layer concern).
 */

export interface PostDetailPageData {
  post: ReturnType<typeof toDetailPostShell>
  body: LexicalBody
  visibleTags: Awaited<ReturnType<typeof getTagsByNames>>
  sidebarPosts: Awaited<ReturnType<typeof selectSidebarPosts>>
  tags: Awaited<ReturnType<typeof listAllTags>>
  detail: PublicDetailData
  imageMeta: Record<string, ResolvedImageMeta>
  /** Resolved music-player metadata by player id (the Lexical body stays storage-pure). */
  musicMeta: Record<string, MusicPlayerBlockMeta>
  draftMarker: DraftMarker
  /** Set when `slug` matched an alias — frontend 301s to this slug. */
  canonicalSlug: string | null
}

export async function loadPostDetailData(
  db: Database,
  rc: RequestContext,
  request: Request,
  slug: string,
  /** Role override from a verified preview token (headless draft preview). */
  previewRole?: Role,
): Promise<PostDetailPageData | null> {
  const sourcePost = (await findPostBySlug(db, slug)) ?? undefined
  let draftMarker: 'draft' | null = null

  let resolved = sourcePost
  if (resolved === undefined) {
    const role = rc.viewer?.role ?? previewRole
    if (postLifecycleAdapter.canPreviewDraft(role)) {
      const preview = await loadDraftPreviewBySlug(db, postLifecycleAdapter, slug)
      if (preview !== null) {
        resolved = preview.preview
        draftMarker = 'draft'
      }
    }
  }

  if (resolved === undefined) {
    return null
  }

  const clientPost = toClientPost(resolved)
  const canonicalSlug = clientPost.slug === slug ? null : clientPost.slug
  const post = toDetailPostShell(clientPost)

  const [visibleTags, imageMeta, sidebarTags, sidebarPosts, musicMeta, { detail }] = await Promise.all([
    getTagsByNames(db, post.tags),
    resolveImageMetaBySources(db, resolved.imageSources).then((r) => Object.fromEntries(r)),
    listAllTags(db).then(selectSidebarTags),
    selectSidebarPosts(db, getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentPosts')),
    resolveMusicMeta(resolved.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds)),
    loadPublicDetailData(db, rc, { type: 'post', ownerId: idFromString(clientPost.id) }),
  ])

  return {
    post,
    body: resolved.body,
    visibleTags,
    sidebarPosts,
    tags: sidebarTags,
    detail,
    imageMeta,
    musicMeta,
    draftMarker,
    canonicalSlug,
  }
}

export interface PageDetailPageData {
  page: Awaited<ReturnType<typeof loadPagePreview>>['page']
  body: Awaited<ReturnType<typeof loadPagePreview>>['body']
  friends: Awaited<ReturnType<typeof listAllFriends>>
  showFriends: boolean
  draftMarker: DraftMarker
  detail: PublicDetailData
  imageMeta: Record<string, ResolvedImageMeta>
  /** Resolved music-player metadata by player id (the Lexical body stays storage-pure). */
  musicMeta: Record<string, MusicPlayerBlockMeta>
  footnotesSectionTitle: string
  /** Weak ETag for the published page — the route loader emits it as the
   *  `ETag` header (HTTP-layer concern stays out of the procedure). */
  publicEtag: string | null
}

export async function loadPageDetailData(
  db: Database,
  rc: RequestContext,
  request: Request,
  slug: string,
  wantsDraftPreview: boolean,
  /** Role override from a verified preview token (headless draft preview). */
  previewRole?: Role,
): Promise<PageDetailPageData> {
  const previewPromise = loadPagePreview({ db, rc, request, slug, wantsDraftPreview, previewRole })
  const [preview, friends, musicMeta] = await Promise.all([
    previewPromise,
    previewPromise.then((p) => (p.showFriends ? listAllFriends(db) : [])),
    previewPromise.then((p) => resolveMusicMeta(p.body, (playerIds) => getPublicMusicMetasByIds(db, playerIds))),
  ])

  const footnotesSectionTitle = resolveFootnotesSectionTitle(requireBlogSettingsSection('content'))

  const { detail } = await loadPublicDetailData(db, rc, { type: 'page', ownerId: idFromString(preview.page.id) })

  return {
    page: preview.page,
    body: preview.body,
    friends,
    showFriends: preview.showFriends,
    draftMarker: preview.draftMarker,
    detail,
    imageMeta: preview.imageMeta,
    musicMeta,
    footnotesSectionTitle,
    publicEtag: preview.publicEtag,
  }
}

/**
 * Resolve music-player metadata for a Lexical body into a player-id keyed
 * record (the SSR-ready twin of the PT `prerenderMusicPlayerBlocks`
 * enrichment — the Lexical wire body stays storage-pure, the metas ride
 * alongside it and the renderer resolves them via its `musicMeta` prop).
 */
async function resolveMusicMeta(
  body: LexicalBody,
  resolveMusicEmbeds: MusicEmbedResolver,
): Promise<Record<string, MusicPlayerBlockMeta>> {
  const playerIds = collectMusicPlayerIds(body)
  if (playerIds.length === 0) {
    return {}
  }
  const metas = await resolveMusicEmbeds(playerIds)
  const out: Record<string, MusicPlayerBlockMeta> = {}
  for (const [playerId, meta] of metas) {
    out[playerId] = {
      id: meta.id,
      name: meta.name,
      artist: meta.artist,
      cover: meta.pic,
      audioUrl: meta.url,
      lyric: meta.lyric,
    }
  }
  return out
}
