import type { LucideIcon } from 'lucide-react'

import {
  ArrowRightIcon,
  ClockIcon,
  FileCheck2Icon,
  FileImageIcon,
  FilePenLineIcon,
  FileTextIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { data, Link } from 'react-router'

import type { EntityType } from '@/server/infra/db/target'

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
import { PendingModerationPanel, pickEmptyStateLine } from '@/ui/admin/welcome/PendingModerationPanel'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'
import { Button } from '@/ui/components/button'

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

interface DraftSummary {
  id: string
  title: string
  updatedAtIso: string
}

interface MyCommentSummary {
  id: string
  excerpt: string
  createdAtIso: string
  isPending: boolean
  entity: { title: string; permalink: string } | null
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

interface StatsGridProps {
  stats: {
    draftCount: number
    publishedCount: number
    myCommentsTotal: number
    myCommentsPending: number
  }
}

// Per-card palette. Each tone pairs a soft status bg fill with its
// matching fg (used for the decorative icon) so the four KPI cards
// read as distinct stripes at a glance while staying on the design
// system's status tokens (auto-flips in dark mode).
const TONE_CLASSES = {
  warn: { bg: 'bg-status-warn-bg', icon: 'text-status-warn-fg' },
  success: { bg: 'bg-status-success-bg', icon: 'text-status-success-fg' },
  info: { bg: 'bg-status-info-bg', icon: 'text-status-info-fg' },
  error: { bg: 'bg-status-error-bg', icon: 'text-status-error-fg' },
} as const

type StatCardTone = keyof typeof TONE_CLASSES

function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="我的草稿"
        value={stats.draftCount}
        href="/admin/posts?published=false"
        icon={FilePenLineIcon}
        tone="warn"
      />
      <StatCard
        label="已发布文章"
        value={stats.publishedCount}
        href="/admin/posts?published=true"
        icon={FileCheck2Icon}
        tone="success"
      />
      <StatCard
        label="我的评论"
        value={stats.myCommentsTotal}
        href="/admin/me/comments"
        icon={MessageSquareIcon}
        tone="info"
      />
      <StatCard
        label="待审评论"
        value={stats.myCommentsPending}
        href="/admin/me/comments?status=pending"
        emphasis={stats.myCommentsPending > 0}
        icon={ClockIcon}
        tone="error"
      />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  href: string
  icon: LucideIcon
  tone: StatCardTone
  emphasis?: boolean
}

function StatCard({ label, value, href, icon: Icon, tone, emphasis }: StatCardProps) {
  const palette = TONE_CLASSES[tone]
  return (
    <Link
      to={href}
      className={`group relative overflow-hidden rounded-lg border p-4 transition-colors hover:border-line-muted ${palette.bg}`}
    >
      {/* Decorative background icon. Inset on the right (`right-3`) so
          it reads as a watermark, not a banner. Hover scales the glyph
          ~12% as a subtle motion cue; `motion-reduce` variants honour
          the user's reduced-motion preference.
          `pointer-events-none` + `aria-hidden` keep it inert. */}
      <Icon
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 right-3 size-14 -translate-y-1/2 opacity-40 transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${palette.icon}`}
        strokeWidth={1.5}
      />
      <p className="relative text-xs text-muted-foreground">{label}</p>
      <p className={`relative mt-1 text-2xl font-semibold ${emphasis ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </Link>
  )
}

function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/post/new" />}>
        <NotebookPenIcon data-icon className="size-4" /> 新建文章
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/editor/page/new" />}>
        <FileTextIcon data-icon className="size-4" /> 新建页面
      </Button>
      <Button type="button" variant="outline" size="sm" render={<Link to="/admin/library/images" />}>
        <FileImageIcon data-icon className="size-4" /> 上传图片
      </Button>
    </div>
  )
}

interface TrendPoint {
  time: string
  visits: number
  visitors: number
}

function WeeklyTrendCard({ points }: { points: TrendPoint[] }) {
  // Aggregate hourly points into daily buckets for a 7-day sparkline.
  const daily = aggregateToDaily(points)
  const maxVisits = Math.max(1, ...daily.map((d) => d.visits))
  const width = 320
  const height = 64
  const padding = 4
  const chartW = width - padding * 2
  const chartH = height - padding * 2
  const stepX = daily.length > 1 ? chartW / (daily.length - 1) : chartW

  const pathPoints = daily.map((d, i) => {
    const x = padding + i * stepX
    const y = padding + chartH - (d.visits / maxVisits) * chartH
    return `${x},${y}`
  })

  const areaPath =
    pathPoints.length > 0
      ? `M${pathPoints[0]} L${pathPoints.slice(1).join(' L')} L${padding + chartW},${padding + chartH} L${padding},${padding + chartH} Z`
      : ''

  const linePath = pathPoints.length > 0 ? `M${pathPoints.join(' L')}` : ''

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2">
        <TrendingUpIcon className="size-4 text-muted-foreground" />
        <h2 className="text-base font-medium">最近 7 天访问趋势</h2>
      </div>
      <div className="mt-4 flex items-end gap-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full max-w-xs" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
        <div className="mb-1 flex flex-col gap-0.5 text-right">
          <span className="text-2xl font-semibold tabular-nums">{daily.reduce((s, d) => s + d.visits, 0)}</span>
          <span className="text-xs text-muted-foreground">总访问</span>
        </div>
      </div>
    </div>
  )
}

function aggregateToDaily(points: TrendPoint[]): { date: string; visits: number; visitors: number }[] {
  const map = new Map<string, { visits: number; visitors: number }>()
  for (const p of points) {
    const date = p.time.slice(0, 10)
    const existing = map.get(date) ?? { visits: 0, visitors: 0 }
    existing.visits += p.visits
    existing.visitors += p.visitors
    map.set(date, existing)
  }
  return Array.from(map.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function RecentPublishedCard({ posts }: { posts: DraftSummary[] }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">最近发布</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?published=true" />}>
          <span className="hidden sm:inline">全部文章</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {posts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无已发布文章。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${post.id}`} className="truncate text-foreground hover:underline">
                {post.title || '(未命名)'}
              </Link>
              <time
                dateTime={post.updatedAtIso}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
                title={post.updatedAtIso}
              >
                {post.updatedAtIso.slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecentDraftsCard({ drafts }: { drafts: DraftSummary[] }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">最近草稿</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/posts?published=false" />}>
          <span className="hidden sm:inline">全部草稿</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {drafts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无草稿，去 创建一篇 吧。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between gap-3">
              <Link to={`/editor/post/${draft.id}`} className="truncate text-foreground hover:underline">
                {draft.title || '(未命名草稿)'}
              </Link>
              <time
                dateTime={draft.updatedAtIso}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
                title={draft.updatedAtIso}
              >
                {draft.updatedAtIso.slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecentMyCommentsCard({ comments }: { comments: MyCommentSummary[] }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium">我的最近评论</h2>
        <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/me/comments" />}>
          <span className="hidden sm:inline">全部评论</span> <ArrowRightIcon data-icon />
        </Button>
      </div>
      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">你还没有发表过评论。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                {comment.entity ? (
                  <Link to={comment.entity.permalink} className="truncate text-foreground hover:underline">
                    《{comment.entity.title}》
                  </Link>
                ) : (
                  <span className="truncate text-muted-foreground">(目标已删除)</span>
                )}
                <time
                  dateTime={comment.createdAtIso}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  title={comment.createdAtIso}
                >
                  {comment.createdAtIso.slice(0, 10)}
                </time>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {comment.isPending ? <span className="mr-2 text-destructive">[待审]</span> : null}
                {comment.excerpt || '(空评论)'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
