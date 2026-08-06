import { z } from 'zod'

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { PortableTextBody } from '@/shared/pt/schema'
import type {
  Category,
  ClientTag,
  CommentFormUser,
  DetailPageShell,
  DetailPostShell,
  DraftMarker,
  Friend,
  ListingPostCard,
  ListingPostCardWithMetadata,
  SidebarPostLink,
} from '@/shared/types/catalog'
import type { DetailPageComments, LatestComment } from '@/shared/types/comments'
import type { ResolvedFonts } from '@/shared/types/fonts'
import type { ResolvedImageMeta } from '@/shared/types/images'
import type { ListingPageLoaderData } from '@/shared/types/listing'
import type { Role } from '@/shared/utils/roles'

// ─── `content.*` — the Ghost-Content-API-style read-only group ─────
// Every public-site SSR loader reaches its data through these
// procedures (in-process via `@/server/http/ssr-caller`), so the wire
// contract is declared here once and shared by both ends.
//
// HTTP signals that cannot cross the RPC wire as thrown `Response`s
// travel as a DISCRIMINATED UNION instead:
//
//   { kind: 'redirect', to, status }   — 301 canonical / 302 pagination
//   { kind: 'not-modified', etag }     — If-None-Match hit (304)
//   { kind: 'ok', ... }                — the payload
//
// Route loaders translate them back into `redirect` /
// `notModifiedResponse` / `data(..., { ETag })`. 404s travel as
// `ORPCError('NOT_FOUND')` and the loader re-throws `notFound()`.
//
// Rich nested DTOs (PortableText bodies, `MetaDescriptor[]`, image-meta
// maps) use `z.custom<T>()` so the inferred output type EXACTLY matches
// the historical loader-data shape — no lossy partial schemas. This is
// the sanctioned exception to the Zod-single-source rule; see
// `src/shared/AGENTS.md` → Zod DTO single source.

export const contentRedirectSignalSchema = z.object({
  kind: z.literal('redirect'),
  to: z.string(),
  status: z.union([z.literal(301), z.literal(302)]),
})
export type ContentRedirectSignal = z.infer<typeof contentRedirectSignalSchema>

export const contentNotModifiedSignalSchema = z.object({
  kind: z.literal('not-modified'),
  etag: z.string(),
})
export type ContentNotModifiedSignal = z.infer<typeof contentNotModifiedSignalSchema>

/** The non-OK half of every content output union. */
export type ContentSignal = ContentRedirectSignal | ContentNotModifiedSignal

// ─── content.bootstrap ────────────────────────────────────────────
// The root loader's data segment. No input: the theme is parsed from
// the theme cookie inside the procedure (`context.requestFacts.cookie`
// + `@/shared/utils/theme-cookie`) so the route never touches cookie
// names.
export const contentBootstrapOutputSchema = z.object({
  admin: z.boolean(),
  currentUser: z.custom<{ id: string; name: string; role: Role } | null>(),
  blogSettings: z.custom<BlogSettingsBundle>().nullable(),
  fonts: z.custom<ResolvedFonts>().nullable(),
  theme: z.enum(['dark', 'light']).nullable(),
  csrfToken: z.string(),
})
export type ContentBootstrapOutput = z.infer<typeof contentBootstrapOutputSchema>

// ─── content.home ─────────────────────────────────────────────────
export interface HomeSidebarPayload {
  posts: SidebarPostLink[]
  tags: ClientTag[]
  recentComments: LatestComment[]
}

export interface HomeExtra {
  categoryLinks: Record<string, string>
  featurePosts: ListingPostCard[]
  sidebar: HomeSidebarPayload
}

export const contentHomeInputSchema = z.object({
  num: z.string().optional(),
})

export const contentHomeOutputSchema = z.union([
  contentRedirectSignalSchema,
  z.object({ kind: z.literal('ok'), listing: z.custom<ListingPageLoaderData<HomeExtra>>() }),
])
export type ContentHomeOutput = z.infer<typeof contentHomeOutputSchema>

// ─── content.posts.list (tag / category scopes) ───────────────────
export const contentPostsListInputSchema = z.object({
  scope: z.object({ type: z.enum(['tag', 'category']), slug: z.string() }),
  num: z.string().optional(),
})

export const contentPostsListOutputSchema = z.union([
  contentRedirectSignalSchema,
  z.object({ kind: z.literal('ok'), listing: z.custom<ListingPageLoaderData>() }),
])
export type ContentPostsListOutput = z.infer<typeof contentPostsListOutputSchema>

// ─── detail critical (shared by post + page) ──────────────────────
// Everything the detail page needs to paint above the fold besides the
// body itself. Comments and webmentions are deliberately EXCLUDED —
// they stream through `content.comments.byKey` / `webmention.list`.
export interface DetailCriticalPayload {
  commentKey: string
  likes: number
  currentUser: CommentFormUser | undefined
  admin: boolean
  recentComments: LatestComment[]
}

// ─── content.posts.bySlug ─────────────────────────────────────────
// `ifNoneMatch` carries the raw If-None-Match header value — the
// procedure owns both ETag probes (slim + full) and answers
// `not-modified` without the route ever computing an ETag.
export const contentPostBySlugInputSchema = z.object({
  slug: z.string(),
  ifNoneMatch: z.string().optional(),
})

export interface PostDetailPayload {
  post: DetailPostShell
  body: PortableTextBody
  visibleTags: ClientTag[]
  sidebarPosts: SidebarPostLink[]
  tags: ClientTag[]
  imageMeta: Record<string, ResolvedImageMeta>
  draftMarker: DraftMarker
  critical: DetailCriticalPayload
}

export const contentPostBySlugOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  z.object({ kind: z.literal('ok'), etag: z.string(), payload: z.custom<PostDetailPayload>() }),
])
export type ContentPostBySlugOutput = z.infer<typeof contentPostBySlugOutputSchema>

// ─── content.pages.bySlug ─────────────────────────────────────────
// `draft` mirrors the `?draft=true` query flag: an admin's draft
// preview may swap the body, so it also skips the published-ETag probe.
export const contentPageBySlugInputSchema = z.object({
  slug: z.string(),
  draft: z.boolean().optional(),
  ifNoneMatch: z.string().optional(),
})

export interface PageDetailPayload {
  page: DetailPageShell
  body: PortableTextBody
  friends: Friend[]
  showFriends: boolean
  draftMarker: DraftMarker
  imageMeta: Record<string, ResolvedImageMeta>
  footnotesSectionTitle: string
  critical: DetailCriticalPayload
}

export const contentPageBySlugOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  // Draft previews carry no public ETag (null) — the route stamps the
  // header only when one exists.
  z.object({ kind: z.literal('ok'), etag: z.string().nullable(), payload: z.custom<PageDetailPayload>() }),
])
export type ContentPageBySlugOutput = z.infer<typeof contentPageBySlugOutputSchema>

// ─── content.comments.byKey ───────────────────────────────────────
// `pageKey` is the metric public id carried by the detail critical
// (`commentKey`) — the SSR detail loaders fire this call only after the
// `bySlug` ok branch settles, so no DB work is wasted on 304/301/404.
export const contentCommentsByKeyInputSchema = z.object({
  pageKey: z.string(),
})

export const contentCommentsByKeyOutputSchema = z.custom<DetailPageComments>()

// ─── content.search ───────────────────────────────────────────────
export const contentSearchInputSchema = z.object({
  keyword: z.string().optional(),
  num: z.string().optional(),
})

export const contentSearchOutputSchema = z.union([
  contentRedirectSignalSchema,
  z.object({ kind: z.literal('ok'), listing: z.custom<ListingPageLoaderData>() }),
])
export type ContentSearchOutput = z.infer<typeof contentSearchOutputSchema>

// ─── content.categories.list ──────────────────────────────────────
export const contentCategoriesListOutputSchema = z.object({
  categories: z.custom<Category[]>(),
})
export type ContentCategoriesListOutput = z.infer<typeof contentCategoriesListOutputSchema>

// ─── content.archives ─────────────────────────────────────────────
export const contentArchivesOutputSchema = z.object({
  resolvedPosts: z.custom<ListingPostCardWithMetadata[]>(),
  listingNowIso: z.string(),
})
export type ContentArchivesOutput = z.infer<typeof contentArchivesOutputSchema>
