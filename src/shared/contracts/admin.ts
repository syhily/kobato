import { z } from 'zod'

import type { AnalyticsOverviewData } from '@/server/domains/analytics/services/overview'
import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'
import type { AccountProfile } from '@/server/domains/users/services/account'
import type { SettingsBundle, SecretMasks } from '@/shared/config/types'
import type { MetricRow } from '@/shared/contracts/analytics'
import type { DraftSummary } from '@/shared/contracts/dashboard'
import type { AdminPostDto } from '@/shared/contracts/posts'

// The admin/me dashboard, settings, session, and analytics SSR loaders
// reach their data through these procedures (in-process via
// `@/server/http/ssr-caller`) — same `z.custom<T>()` bargain as
// `contracts/content.ts`; HTTP-path coverage in
// `tests/it/server/http/admin-api.test.ts` (see `src/shared/AGENTS.md`).

// `getAccountProfile`'s full projection (deleted-mid-session rows degrade
// to empty fields) plus the two feature switches the profile page renders.
export const accountProfileOutputSchema = z.object({
  user: z.custom<AccountProfile>(),
  passkeyEnabled: z.boolean(),
  mailReady: z.boolean(),
})
export type AccountProfileOutput = z.infer<typeof accountProfileOutputSchema>

// Raw `listSessionsByUser` rows — sorting / `isCurrent` projection stays
// in the route loader (`parseSessionSort` is shared).
export const accountSessionsOutputSchema = z.custom<SessionMeta[]>()
export type AccountSessionsOutput = z.infer<typeof accountSessionsOutputSchema>

export const adminUsersCountOutputSchema = z.number().int().nonnegative()

export const adminUsersListSessionsOutputSchema = z.custom<SessionWithUser[]>()

export const adminUsersPasskeyFlagOutputSchema = z.boolean()

// The full `countMyComments` tuple — the profile card renders all four
// counters; the service tuple passes through unchanged.
export const commentsMyCountsOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  deleteRequested: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
})
export type CommentsMyCountsOutput = z.infer<typeof commentsMyCountsOutputSchema>

// Follow-up resolve for a URL-pinned `type:ownerId` entity not in the
// mine-comments list; null when malformed or hard-deleted.
export const commentsResolveEntityInputSchema = z.object({
  entity: z.string().min(1).max(2048),
})
export const commentsResolveEntityOutputSchema = z.object({ value: z.string(), label: z.string() }).nullable()
export type CommentsResolveEntityOutput = z.infer<typeof commentsResolveEntityOutputSchema>

// `countAdminPendingDashboard` projected to the `{ all }` badge the
// admin layout renders; the approval/deletion split stays server-side.
export const adminCommentsPendingCountOutputSchema = z.object({
  all: z.number().int().nonnegative(),
})

export const adminWebmentionsPendingCountOutputSchema = z.number().int().nonnegative()

// Draft/published counts + the two recent-5 lists the dashboard cards
// consume (projected to `DraftSummary`, identical to `loaders/dashboard.ts`).
export const adminPostsMySummaryOutputSchema = z.object({
  draftCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  recentDrafts: z.custom<DraftSummary[]>(),
  recentPublished: z.custom<DraftSummary[]>(),
})
export type AdminPostsMySummaryOutput = z.infer<typeof adminPostsMySummaryOutputSchema>

// `search` carries the raw query string; `parseAnalyticsSearch` stays
// server-side so the URL grammar lives in one place.
export const adminAnalyticsSearchInputSchema = z.object({
  search: z.string().max(16_384),
})
export type AdminAnalyticsSearchInput = z.infer<typeof adminAnalyticsSearchInputSchema>

export const adminAnalyticsOverviewOutputSchema = z.custom<AnalyticsOverviewData>()

export const adminAnalyticsMentionsOutputSchema = z.object({
  referers: z.custom<MetricRow[]>(),
})

// Per-post analytics payload: the admin post DTO plus the overview
// fan-out scoped to that post.
export const adminPostAnalyticsInputSchema = z.object({
  postId: z.number().int().positive(),
  search: z.string().max(16_384),
})
export type AdminPostAnalyticsInput = z.infer<typeof adminPostAnalyticsInputSchema>

export interface AdminPostAnalyticsData extends AnalyticsOverviewData {
  post: AdminPostDto
}
export const adminPostAnalyticsOutputSchema = z.custom<AdminPostAnalyticsData>()
export type AdminPostAnalyticsOutput = z.infer<typeof adminPostAnalyticsOutputSchema>

// Settings layout loader data: the redacted (secrets stripped) backfilled
// bundle, the IANA timezone list, and the secret masks. `SERVICE_UNAVAILABLE`
// (503) carries the uninstalled / truncated-sections semantics the layout
// route currently throws.
export const adminSettingsBootstrapOutputSchema = z.object({
  bundle: z.custom<SettingsBundle>(),
  timeZones: z.custom<readonly string[]>(),
  masks: z.custom<SecretMasks>(),
})
export type AdminSettingsBootstrapOutput = z.infer<typeof adminSettingsBootstrapOutputSchema>
