import type { AnalyticsOverviewData } from '@kobato/server/domains/analytics/services/overview.ts'
import type { AccountProfile } from '@kobato/server/domains/users/services/account.ts'

import { z } from 'zod'

import type { SettingsBundle, SecretMasks } from '../config/types'
import type { Role } from '../utils/roles'
import type { MetricRow } from './analytics'
import type { DraftSummary } from './dashboard'
import type { AdminPostDto } from './posts'

import { optionalHttpUrlSchema } from '../utils/safe-url'
import { clearable, mergePatchInput } from './merge-patch'

// Admin/me dashboard, settings, session and analytics SSR loader contracts. The
// `z.custom<T>()` outputs must match the loader-data shapes exactly; HTTP-path
// coverage lives in `packages/server/tests/it/server/http/admin-api.test.ts`.

// `getAccountProfile`'s full projection (deleted-mid-session rows degrade
// to empty fields) plus the two feature switches the profile page renders.
export const accountProfileOutputSchema = z.object({
  user: z.custom<AccountProfile>(),
  passkeyEnabled: z.boolean(),
  mailReady: z.boolean(),
})
export type AccountProfileOutput = z.infer<typeof accountProfileOutputSchema>

// `account.update-profile` wire input — session-identity profile edits (no
// caller-supplied id, deliberately NOT merge-patch). The profile view derives
// its payload type from this schema instead of the server router.
export const accountUpdateProfileInput = z.object({
  name: z.string().min(1).max(50).optional(),
  // http(s)-only like the admin user-edit schema — a bare z.url() would
  // accept javascript:/data: hrefs into the profile link.
  link: clearable(optionalHttpUrlSchema),
  badgeName: clearable(z.string().max(20)),
  badgeColor: clearable(z.string().max(7)),
  badgeTextColor: clearable(z.string().max(7)),
  receiveEmail: z.boolean().optional(),
})
export type AccountUpdateProfileInput = z.infer<typeof accountUpdateProfileInput>

// Session-list wire rows. The UA label is rendered server-side
// (`formatUaLabel`, node-device-detector) — the browser never parses a UA.
export interface AccountSessionDto {
  sid: string
  userId: number
  label: string
  ip: string
  loginAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export interface AdminSessionDto extends AccountSessionDto {
  userName: string
  userEmail: string
  userRole: Role | null
}

export const accountSessionsOutputSchema = z.custom<AccountSessionDto[]>()
export type AccountSessionsOutput = z.infer<typeof accountSessionsOutputSchema>

export const adminUsersCountOutputSchema = z.number().int().nonnegative()

export const adminUsersListSessionsOutputSchema = z.custom<AdminSessionDto[]>()

export const adminUsersPasskeyFlagOutputSchema = z.boolean()

// `admin.users.update` wire input — the merge-patch field-update contract for
// the admin user editor. The web form derives its payload type from this
// schema, so the form and the server validate against one shape.
export const adminUserUpdateInput = mergePatchInput({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  link: clearable(optionalHttpUrlSchema),
  badgeName: clearable(z.string()),
  badgeColor: clearable(z.string()),
  badgeTextColor: clearable(z.string()),
})
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateInput>

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
