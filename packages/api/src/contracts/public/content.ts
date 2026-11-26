import type { DetailPageComments, LatestComment } from '@kobato/api/contracts/public/comments'
import type { ResolvedFonts } from '@kobato/assets/fonts'
import type { Role } from '@kobato/auth/roles'
import type { ListingPageLoaderData } from '@kobato/catalog/listing'
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
} from '@kobato/catalog/model'
import type { KobatoInklingLabelTable } from '@kobato/i18n/inkling-labels/en-US'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { frontendRumBootstrapSchema } from '@kobato/settings/telemetry/rum'
import { z } from 'zod'

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

export type ContentSignal = ContentRedirectSignal | ContentNotModifiedSignal

export function isContentRedirectSignal(value: unknown): value is ContentRedirectSignal {
  return contentRedirectSignalSchema.safeParse(value).success
}

export const contentBootstrapInputSchema = z
  .object({
    scope: z.enum(['public', 'workspace']).default('public'),
  })
  .default({ scope: 'public' })
export type ContentBootstrapInput = z.input<typeof contentBootstrapInputSchema>

export const contentBootstrapI18nSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  revision: z.string(),
  messages: z.custom<Readonly<Record<string, string>>>(),
  inklingLabels: z.custom<KobatoInklingLabelTable>().optional(),
})
export type ContentBootstrapI18n = z.infer<typeof contentBootstrapI18nSchema>

export const contentBootstrapOutputSchema = z.object({
  admin: z.boolean(),
  currentUser: z.custom<{ id: string; name: string; email: string; role: Role } | null>(),
  blogSettings: z.custom<BlogSettingsBundle>().nullable(),
  fonts: z.custom<ResolvedFonts>().nullable(),
  theme: z.enum(['dark', 'light']).nullable(),
  csrfToken: z.string(),
  rum: frontendRumBootstrapSchema.nullable(),
  installState: z.enum(['noAdmin', 'installed']),
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

export interface DetailCriticalPayload {
  commentKey: string
  likes: number
  currentUser: CommentFormUser | undefined
  admin: boolean
  recentComments: LatestComment[]
  commentsFingerprint: string
}

export const contentPostBySlugInputSchema = z.object({
  slug: z.string(),
  ifNoneMatch: z.string().optional(),
})

export interface PostDetailPayload {
  post: DetailPostShell
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
  z.object({ kind: z.literal('ok'), etag: z.string().nullable(), payload: z.custom<PostDetailPayload>() }),
])
export type ContentPostBySlugOutput = z.infer<typeof contentPostBySlugOutputSchema>

export const contentPageBySlugInputSchema = z.object({
  slug: z.string(),
  draft: z.boolean().optional(),
  ifNoneMatch: z.string().optional(),
})

export interface PageDetailPayload {
  page: DetailPageShell
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

export const contentCommentsByKeyInputSchema = z.object({
  pageKey: z.string(),
})

export const contentCommentsByKeyOutputSchema = z.custom<DetailPageComments>()

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
