import { z } from 'zod'

import type { AnalyticsOverviewData } from '@/server/domains/analytics/services/overview'
import type { SessionMeta, SessionWithUser } from '@/server/domains/auth/repo'
import type { AccountProfile } from '@/server/domains/users/services/account'
import type { SettingsBundle, SecretMasks } from '@/shared/config/types'
import type { MetricRow } from '@/shared/contracts/analytics'
import type { DraftSummary } from '@/shared/contracts/dashboard'
import type { AdminPostDto } from '@/shared/contracts/posts'

// ─── The admin SSR wire contract ─────────────────────────
// The admin/me dashboard, settings, session, and analytics SSR loaders
// reach their data through these procedures (in-process via
// `@/server/http/ssr-caller`), so the wire contract is declared here once
// and shared by both ends — same `z.custom<T>()` bargain as
// `contracts/content.ts`: rich loader-data outputs reuse the historical
// loader-data / domain types EXACTLY (bit-identical SSR payloads), and
// HTTP-path coverage is planned in `tests/it/server/http/admin-api.test.ts`.
// Inputs and simple scalar outputs still use real Zod. See
// `src/shared/AGENTS.md` → Zod DTO single source.

// ─── account.profile / account.sessions ─────────────────
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

// ─── admin.users.* ───────────────────────────────────────
export const adminUsersCountOutputSchema = z.number().int().nonnegative()

export const adminUsersListSessionsOutputSchema = z.custom<SessionWithUser[]>()

export const adminUsersPasskeyFlagOutputSchema = z.boolean()

// ─── comments-authed.* ───────────────────────────────────
// The full `countMyComments` tuple — the profile card renders all four
// counters (the third row is "申请删除"), and the dashboard reads
// total/pending. The service tuple passes through unchanged so the SSR
// loaderData stays bit-identical to the historical direct call.
export const commentsMyCountsOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  deleteRequested: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
})
export type CommentsMyCountsOutput = z.infer<typeof commentsMyCountsOutputSchema>

// Follow-up resolve for a URL-pinned `type:ownerId` entity that is not in
// the mine-comments entity list — `null` when the entity key is malformed
// or the entity was hard-deleted (the caller keeps the pinned raw key).
export const commentsResolveEntityInputSchema = z.object({
  entity: z.string().min(1).max(2048),
})
export const commentsResolveEntityOutputSchema = z.object({ value: z.string(), label: z.string() }).nullable()
export type CommentsResolveEntityOutput = z.infer<typeof commentsResolveEntityOutputSchema>

// ─── admin.comments.* / admin.webmentions.* ──────────────
// `countAdminPendingDashboard` projected to the `{ all }` badge the
// admin layout renders; the approval/deletion split stays server-side.
export const adminCommentsPendingCountOutputSchema = z.object({
  all: z.number().int().nonnegative(),
})

export const adminWebmentionsPendingCountOutputSchema = z.number().int().nonnegative()

// ─── admin.posts.mySummary ───────────────────────────────
// Draft/published counts + the two recent-5 lists the dashboard cards
// consume (projected to `DraftSummary`, identical to `loaders/dashboard.ts`).
export const adminPostsMySummaryOutputSchema = z.object({
  draftCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  recentDrafts: z.custom<DraftSummary[]>(),
  recentPublished: z.custom<DraftSummary[]>(),
})
export type AdminPostsMySummaryOutput = z.infer<typeof adminPostsMySummaryOutputSchema>

// ─── admin.analytics.* ───────────────────────────────────
// `search` carries the raw query string (`preset=…&startAt=…&filters=…`);
// `parseAnalyticsSearch` stays server-side so the URL grammar lives in
// one place.
export const adminAnalyticsSearchInputSchema = z.object({
  search: z.string().max(16_384),
})
export type AdminAnalyticsSearchInput = z.infer<typeof adminAnalyticsSearchInputSchema>

export const adminAnalyticsOverviewOutputSchema = z.custom<AnalyticsOverviewData>()

export const adminAnalyticsMentionsOutputSchema = z.object({
  referers: z.custom<MetricRow[]>(),
})

// ─── admin.posts.analytics ───────────────────────────────
// The per-post analytics payload: the admin post DTO plus the overview
// fan-out scoped to that post. Shape-identical to the historical
// `loaders/post-analytics.ts` `PostAnalyticsData`.
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

// ─── admin.settings.bootstrap ────────────────────────────
// The settings layout loader data: the redacted (secrets stripped) fully
// backfilled bundle, the IANA timezone list, and the secret masks for the
// admin UI hints. `SERVICE_UNAVAILABLE` (503) carries the uninstalled /
// truncated-sections semantics the layout route currently throws.
export const adminSettingsBootstrapOutputSchema = z.object({
  bundle: z.custom<SettingsBundle>(),
  timeZones: z.custom<readonly string[]>(),
  masks: z.custom<SecretMasks>(),
})
export type AdminSettingsBootstrapOutput = z.infer<typeof adminSettingsBootstrapOutputSchema>
