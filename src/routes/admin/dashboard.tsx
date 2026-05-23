import { data } from 'react-router'

import type { EntityType } from '@/server/infra/db/target'
import type { DraftSummary, MyCommentSummary } from '@/ui/admin/dashboard/types'

import { queryCounters, queryViews } from '@/server/domains/analytics/query'
import { getRouteRequestContext } from '@/server/domains/auth/context'
import { requireRole } from '@/server/domains/auth/rbac'
import { countMyComments, listMyComments } from '@/server/domains/comments/repos/admin-query'
import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query'
import { loadAdminPendingDashboard } from '@/server/domains/comments/services/admin-query'
import { countPostMetas, listPostMetas } from '@/server/domains/posts/repos/admin-query'
import { bundleFromMatches, routeMeta } from '@/server/render/seo/meta'
import { computeDateRange } from '@/shared/contracts/analytics'
import { roleLabel } from '@/shared/utils/roles'
import { QuickActions } from '@/ui/admin/dashboard/QuickActions'
import { RecentDraftsCard } from '@/ui/admin/dashboard/RecentDraftsCard'
import { RecentMyCommentsCard } from '@/ui/admin/dashboard/RecentMyCommentsCard'
import { RecentPublishedCard } from '@/ui/admin/dashboard/RecentPublishedCard'
import { StatsGrid } from '@/ui/admin/dashboard/StatsGrid'
import { WeeklyTrendCard } from '@/ui/admin/dashboard/WeeklyTrendCard'
import { PendingModerationPanel, pickEmptyStateLine } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

import type { Route } from './+types/dashboard'

export function meta({ matches }: Route.MetaArgs) {
  return routeMeta({ title: '欢迎' }, bundleFromMatches(matches))
}

const RECENT_DRAFTS_LIMIT = 5
const RECENT_PUBLISHED_LIMIT = 5
const RECENT_MY_COMMENTS_LIMIT = 5
const COMMENT_EXCERPT_LIMIT = 60
// Must stay in lockstep with the `PAGE_SIZE` constant in
// `PendingModerationPanel.tsx` — the panel's pagination math reads the
// initial payload assuming this page size.
const PENDING_PAGE_SIZE = 3

function entityPermalink(type: EntityType, slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

function makeExcerpt(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return ''
  }
  // Iterate by code points so a surrogate pair doesn't get split — matches
  // the helper in `admin.my.comments.tsx` but with a tighter cap because
  // this widget renders inside a card list, not a full table cell.
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= COMMENT_EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, COMMENT_EXCERPT_LIMIT).join('')}…`
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = getRouteRequestContext({ request, context })
  // Defence-in-depth: `admin.layout` already gates author+, but
  // asserting here narrows `ctx.user` / `ctx.role` to non-null for the
  // loader body so the response shape is statically tight.
  requireRole(ctx, 'author')
  const now = new Date()
  const hour = now.getHours()
  let greeting = '你好'
  if (hour >= 23 || hour < 5) {
    greeting = '夜深了，还没睡么？记得早点休息'
  } else if (hour < 11) {
    greeting = '早上好，新的一天开始啦'
  } else if (hour < 14) {
    greeting = '中午好，记得吃午饭'
  } else if (hour < 18) {
    greeting = '下午好'
  } else {
    greeting = '晚上好'
  }

  const userId = BigInt(ctx.user.id)
  const authorId = userId
  const admin = ctx.user.role === 'admin'

  // Fan out every dashboard query in one go. Each branch is a small
  // count(*) or LIMIT-5 select, so the round-trip wins dominate the
  // per-query CPU cost.
  const nowSec = Math.floor(now.getTime() / 1000)
  const dayRange = { startAt: nowSec - 24 * 60 * 60, endAt: nowSec }
  const weekRange = computeDateRange('last-7d', now)

  const [
    pendingModeration,
    visitSummary,
    weeklyTrend,
    draftCount,
    publishedCount,
    myCommentCounts,
    recentDraftRows,
    recentPublishedRows,
    recentMyCommentRows,
  ] = await Promise.all([
    admin ? loadAdminPendingDashboard('all', 0, PENDING_PAGE_SIZE) : Promise.resolve(null),
    admin ? queryCounters({ range: dayRange, filters: {} }) : Promise.resolve(null),
    admin ? queryViews({ range: weekRange, filters: {} }) : Promise.resolve(null),
    countPostMetas({ authorId, deletedStatus: 'normal', lifecycle: 'draft' }),
    countPostMetas({ authorId, deletedStatus: 'normal', lifecycle: 'published' }),
    countMyComments(userId),
    listPostMetas({
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'draft',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      limit: RECENT_DRAFTS_LIMIT,
    }),
    listPostMetas({
      authorId,
      deletedStatus: 'normal',
      lifecycle: 'published',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
      limit: RECENT_PUBLISHED_LIMIT,
    }),
    listMyComments(userId, 0, RECENT_MY_COMMENTS_LIMIT),
  ])

  // Project drafts: only id + title + updatedAt needed for the card.
  const recentDrafts: DraftSummary[] = recentDraftRows.map((row) => ({
    id: String(row.id),
    title: row.title,
    updatedAtIso: row.updatedAt.toISOString(),
  }))

  // Project recently published posts.
  const recentPublished: DraftSummary[] = recentPublishedRows.map((row) => ({
    id: String(row.id),
    title: row.title,
    updatedAtIso: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(),
  }))

  // Resolve permalinks for the comments widget. Authors mostly comment on
  // posts/pages that still exist, but skip the join entirely on an empty
  // page so we don't issue a no-op `IN ()` query.
  const entityPairs = recentMyCommentRows
    .filter((c): c is typeof c & { type: EntityType; ownerId: bigint } => c.type !== null && c.ownerId !== null)
    .map((c) => ({ type: c.type, ownerId: c.ownerId }))
  const entityMap = entityPairs.length > 0 ? await resolveEntitiesForComments(entityPairs) : new Map()
  const recentMyComments: MyCommentSummary[] = recentMyCommentRows.map((c) => {
    const entity = c.type && c.ownerId !== null ? (entityMap.get(`${c.type}:${c.ownerId}`) ?? null) : null
    return {
      id: String(c.id),
      excerpt: makeExcerpt(c.content ?? ''),
      createdAtIso: c.createAt ? new Date(c.createAt).toISOString() : '',
      isPending: c.isPending === true,
      entity: entity ? { title: entity.title, permalink: entityPermalink(entity.type, entity.slug) } : null,
    }
  })

  return data({
    name: ctx.user.name,
    role: ctx.user.role,
    greeting,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLine: pickEmptyStateLine(),
    stats: {
      draftCount,
      publishedCount,
      myCommentsTotal: myCommentCounts.total,
      myCommentsPending: myCommentCounts.pending,
    },
    recentDrafts,
    recentPublished,
    recentMyComments,
  })
}

export default function DashboardRoute({ loaderData }: Route.ComponentProps) {
  const {
    name,
    role,
    greeting,
    pendingModeration,
    visitSummary,
    weeklyTrend,
    emptyStateLine,
    stats,
    recentDrafts,
    recentPublished,
    recentMyComments,
  } = loaderData
  const isAdmin = role === 'admin'
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting}，{name}
          </h1>
          <p className="mt-1 text-muted-foreground">当前身份：{roleLabel(role)}</p>
        </div>
        <QuickActions />
      </div>
      {isAdmin && visitSummary !== null && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <VisitSummaryCard summary={visitSummary} />
          {pendingModeration !== null && (
            <PendingModerationPanel initial={pendingModeration} emptyStateLine={emptyStateLine} />
          )}
        </div>
      )}
      <StatsGrid stats={stats} />
      {isAdmin && weeklyTrend !== null && weeklyTrend.length > 0 && <WeeklyTrendCard points={weeklyTrend} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentPublishedCard posts={recentPublished} />
        <RecentDraftsCard drafts={recentDrafts} />
      </div>
      <RecentMyCommentsCard comments={recentMyComments} />
    </div>
  )
}
