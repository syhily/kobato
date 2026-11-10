import { z } from 'zod'

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { KobatoInklingLabelTable } from '@/shared/i18n/inkling-labels/en-US'
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
import type { ListingPageLoaderData } from '@/shared/types/listing'
import type { Role } from '@/shared/utils/roles'

import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// `content.*` — the Ghost-Content-API-style read-only group backing every public
// SSR loader (in-process via `@/server/http/ssr-caller`). HTTP signals that cannot
// cross the RPC wire as thrown `Response`s travel as a discriminated union; 404s
// as `ORPCError('NOT_FOUND')`; rich nested DTOs use `z.custom<T>()` — the
// sanctioned Zod-single-source exception.

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

// The root loader's data segment. No input: the theme is parsed from the
// cookie inside the procedure so the route never touches cookie names.
//
// `i18n` carries the request's representation token (`revision` — the settings
// snapshot generation, the same token cache keys and ETags use), the CURRENT
// locale's UI catalog for the document's SCOPE, and — on workspace paths only —
// the current locale's Inkling label overlay. Public documents never receive the
// `admin.*` namespace or an editor label table; `/admin` and `/editor` receive
// both. `messages` / `inklingLabels` are typed rather than re-validated here:
// importing a catalog module into this module would defeat that boundary.
export const contentBootstrapI18nSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  /** Opaque settings-snapshot token; consumers only compare it (dedupe / cache keys). */
  revision: z.string(),
  /** Full workspace catalog, or the public subset without `admin.*`. */
  messages: z.custom<Readonly<Record<string, string>>>(),
  /** Present on workspace paths only; public documents load the active locale's table on demand. */
  inklingLabels: z.custom<KobatoInklingLabelTable>().optional(),
})
export type ContentBootstrapI18n = z.infer<typeof contentBootstrapI18nSchema>

export const contentBootstrapOutputSchema = z.object({
  admin: z.boolean(),
  currentUser: z.custom<{ id: string; name: string; role: Role } | null>(),
  blogSettings: z.custom<BlogSettingsBundle>().nullable(),
  fonts: z.custom<ResolvedFonts>().nullable(),
  theme: z.enum(['dark', 'light']).nullable(),
  csrfToken: z.string(),
  i18n: contentBootstrapI18nSchema,
})
export type ContentBootstrapOutput = z.infer<typeof contentBootstrapOutputSchema>

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
  /** Raw `If-None-Match` — the procedure owns listing revalidation. */
  ifNoneMatch: z.string().optional(),
})

export const contentHomeOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  z.object({
    kind: z.literal('ok'),
    etag: z.string(),
    listing: z.custom<ListingPageLoaderData<HomeExtra>>(),
  }),
])
export type ContentHomeOutput = z.infer<typeof contentHomeOutputSchema>

export const contentPostsListInputSchema = z.object({
  scope: z.object({ type: z.enum(['tag', 'category']), slug: z.string() }),
  num: z.string().optional(),
  ifNoneMatch: z.string().optional(),
})

export const contentPostsListOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  z.object({
    kind: z.literal('ok'),
    etag: z.string(),
    listing: z.custom<ListingPageLoaderData>(),
  }),
])
export type ContentPostsListOutput = z.infer<typeof contentPostsListOutputSchema>

// Detail critical (shared by post + page): everything the detail page needs
// above the fold besides the body. Comments and webmentions are deliberately
// EXCLUDED — they stream through `content.comments.byKey` / `webmention.list`.
export interface DetailCriticalPayload {
  commentKey: string
  likes: number
  currentUser: CommentFormUser | undefined
  admin: boolean
  recentComments: LatestComment[]
}

// `ifNoneMatch` carries the raw If-None-Match header value. Revalidation
// happens in the procedure AFTER the full payload (shell + body + tags +
// sidebar + critical) is fingerprinted; draft previews never carry a tag.
export const contentPostBySlugInputSchema = z.object({
  slug: z.string(),
  ifNoneMatch: z.string().optional(),
})

export interface PostDetailPayload {
  post: DetailPostShell
  /** Saved `body_html` projection (inkling exportDOM); sanitized at the render boundary. */
  bodyHtml: string
  visibleTags: ClientTag[]
  sidebarPosts: SidebarPostLink[]
  tags: ClientTag[]
  draftMarker: DraftMarker
  critical: DetailCriticalPayload
}

export const contentPostBySlugOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  // Draft previews carry no public ETag (null) — the route stamps the header
  // only when one exists.
  z.object({ kind: z.literal('ok'), etag: z.string().nullable(), payload: z.custom<PostDetailPayload>() }),
])
export type ContentPostBySlugOutput = z.infer<typeof contentPostBySlugOutputSchema>

// `draft` mirrors the `?draft=true` query flag: an admin's draft preview may
// swap the body, so it never carries (or honours) the published ETag.
export const contentPageBySlugInputSchema = z.object({
  slug: z.string(),
  draft: z.boolean().optional(),
  ifNoneMatch: z.string().optional(),
})

export interface PageDetailPayload {
  page: DetailPageShell
  /** Saved `body_html` projection (inkling exportDOM); sanitized at the render boundary. */
  bodyHtml: string
  friends: Friend[]
  showFriends: boolean
  draftMarker: DraftMarker
  critical: DetailCriticalPayload
}

export const contentPageBySlugOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  z.object({ kind: z.literal('ok'), etag: z.string().nullable(), payload: z.custom<PageDetailPayload>() }),
])
export type ContentPageBySlugOutput = z.infer<typeof contentPageBySlugOutputSchema>

// `pageKey` is the metric public id carried by the detail critical
// (`commentKey`); fired only after the `bySlug` ok branch settles, so
// no DB work is wasted on 304/301/404.
export const contentCommentsByKeyInputSchema = z.object({
  pageKey: z.string(),
})

export const contentCommentsByKeyOutputSchema = z.custom<DetailPageComments>()

// The keyword drives a full-corpus LIKE scan (three leading-wildcard patterns)
// and becomes a cache key + audit detail — cap it. Empty stays legal: the
// loader bounces a blank keyword to `/` (and skips the audit row).
export const SEARCH_KEYWORD_MAX_LENGTH = 200

export const contentSearchInputSchema = z.object({
  keyword: z.string().trim().max(SEARCH_KEYWORD_MAX_LENGTH).optional(),
  num: z.string().optional(),
  ifNoneMatch: z.string().optional(),
})

export const contentSearchOutputSchema = z.union([
  contentRedirectSignalSchema,
  contentNotModifiedSignalSchema,
  z.object({
    kind: z.literal('ok'),
    etag: z.string(),
    listing: z.custom<ListingPageLoaderData>(),
  }),
])
export type ContentSearchOutput = z.infer<typeof contentSearchOutputSchema>

export const contentCategoriesListInputSchema = z.object({
  ifNoneMatch: z.string().optional(),
})

export const contentCategoriesListOutputSchema = z.union([
  contentNotModifiedSignalSchema,
  z.object({
    kind: z.literal('ok'),
    etag: z.string(),
    payload: z.object({ categories: z.custom<Category[]>() }),
  }),
])
export type ContentCategoriesListOutput = z.infer<typeof contentCategoriesListOutputSchema>

export const contentArchivesInputSchema = z.object({
  ifNoneMatch: z.string().optional(),
})

export const contentArchivesOutputSchema = z.union([
  contentNotModifiedSignalSchema,
  z.object({
    kind: z.literal('ok'),
    etag: z.string(),
    payload: z.object({
      resolvedPosts: z.custom<ListingPostCardWithMetadata[]>(),
      listingNowIso: z.string(),
    }),
  }),
])
export type ContentArchivesOutput = z.infer<typeof contentArchivesOutputSchema>
