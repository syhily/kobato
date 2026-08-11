import { useMutation, type InfiniteData } from '@tanstack/react-query'
import { AtSignIcon, CheckIcon, CircleAlertIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminWebmentionWire } from '@/shared/contracts/webmentions'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { tryParseUrl } from '@/shared/utils/safe-url'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { Badge, type BadgeProps } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { Tooltip } from '@/ui/components/tooltip'

const PAGE_SIZE = 30
const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

type StatusFilter = 'all' | AdminWebmentionWire['status']

const STATUS_META: Record<AdminWebmentionWire['status'], { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: '待审核', variant: 'secondary' },
  approved: { label: '已批准', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
  hidden: { label: '已隐藏', variant: 'outline' },
}

// Response-type labels (mf2 classification — presentational only).
const TYPE_META: Record<AdminWebmentionWire['type'], { label: string }> = {
  mention: { label: '提及' },
  reply: { label: '回应' },
  like: { label: '喜欢' },
  repost: { label: '转发' },
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && (value === 'all' || value in STATUS_META)
}

export type AdminWebmentionsPage = Awaited<ReturnType<typeof orpc.admin.webmentions.loadAll>>
export type AdminWebmentionsData = InfiniteData<AdminWebmentionsPage, number>

/** Local cache patch after a moderation mutation: the row takes its new
 *  terminal status; under a non-`all` filter it leaves the visible list. */
export function moderateMentionInPages(
  data: AdminWebmentionsData,
  id: string,
  status: 'approved' | 'rejected',
  filter: StatusFilter,
): AdminWebmentionsData {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const hit = page.mentions.find((mention) => mention.id === id)
      if (!hit) {
        return page
      }
      const statusCounts = {
        ...page.statusCounts,
        pending: Math.max(0, page.statusCounts.pending - (hit.status === 'pending' ? 1 : 0)),
        approved: page.statusCounts.approved + (status === 'approved' ? 1 : 0) - (hit.status === 'approved' ? 1 : 0),
        rejected: page.statusCounts.rejected + (status === 'rejected' ? 1 : 0) - (hit.status === 'rejected' ? 1 : 0),
        hidden: Math.max(0, page.statusCounts.hidden - (hit.status === 'hidden' ? 1 : 0)),
      }
      return {
        ...page,
        mentions:
          filter === 'all'
            ? page.mentions.map((mention) => (mention.id === id ? { ...mention, status } : mention))
            : page.mentions.filter((mention) => mention.id !== id),
        statusCounts,
      }
    }),
  }
}

/** Local cache patch after re-verification: the server row is authoritative;
 *  a `hidden` row restored to `approved` leaves the 已隐藏 filter. */
export function applyReverifyToPages(
  data: AdminWebmentionsData,
  row: AdminWebmentionWire,
  filter: StatusFilter,
): AdminWebmentionsData {
  return {
    ...data,
    pages: data.pages.map((page) => {
      const hit = page.mentions.find((mention) => mention.id === row.id)
      if (!hit) {
        return page
      }
      const restored = hit.status === 'hidden' && row.status === 'approved'
      const statusCounts = restored
        ? {
            ...page.statusCounts,
            hidden: Math.max(0, page.statusCounts.hidden - 1),
            approved: page.statusCounts.approved + 1,
          }
        : page.statusCounts
      return {
        ...page,
        mentions:
          restored && filter === 'hidden'
            ? page.mentions.filter((mention) => mention.id !== row.id)
            : page.mentions.map((mention) => (mention.id === row.id ? row : mention)),
        statusCounts,
      }
    }),
  }
}

/** Author line falls back to the source hostname when no author metadata
 *  was extracted. */
function authorLabel(mention: AdminWebmentionWire): string {
  if (mention.authorName !== null && mention.authorName !== '') {
    return mention.authorName
  }
  return tryParseUrl(mention.sourceUrl)?.hostname ?? mention.sourceUrl
}

/** Verification badge: 已验证 for a clean check; 验证失败 with the last
 *  failure message (+ consecutive-day count) on hover. */
function VerificationBadge({ mention }: { mention: AdminWebmentionWire }) {
  if (mention.verificationStatus === 'verified') {
    return (
      <Badge variant="outline">
        <CheckIcon /> 已验证
      </Badge>
    )
  }
  const streak = mention.verifyFailStreak > 0 ? ` · 已连续失败 ${mention.verifyFailStreak} 天` : ''
  return (
    <Tooltip>
      <Tooltip.Trigger as="span" className="cursor-help">
        <Badge variant="destructive">
          <CircleAlertIcon /> 验证失败
        </Badge>
      </Tooltip.Trigger>
      <Tooltip.Content>
        {mention.lastError ?? '未知错误'}
        {streak}
      </Tooltip.Content>
    </Tooltip>
  )
}

interface InboxRowProps {
  mention: AdminWebmentionWire
  onApprove: (mention: AdminWebmentionWire) => void
  onReject: (mention: AdminWebmentionWire) => void
  onReverify: (mention: AdminWebmentionWire) => void
  isBusy: (mention: AdminWebmentionWire) => boolean
}

function InboxRow({ mention, onApprove, onReject, onReverify, isBusy }: InboxRowProps) {
  const config = useSiteIdentity()
  const meta = STATUS_META[mention.status]
  const busy = isBusy(mention)
  // Re-verification is the only recovery path for a hidden row, and a failed
  // verification can always be re-checked; rejected rows are terminal.
  const showReverify =
    mention.status !== 'rejected' && (mention.status === 'hidden' || mention.verificationStatus === 'failed')
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        <VerificationBadge mention={mention} />
        <Badge variant="outline">{TYPE_META[mention.type].label}</Badge>
        <span className="text-sm font-medium">{authorLabel(mention)}</span>
        <a
          href={mention.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link text-sm break-all hover:underline"
        >
          {mention.title ?? mention.sourceUrl}
        </a>
      </div>
      {mention.summary !== null && <p className="line-clamp-2 text-sm text-muted-foreground">{mention.summary}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs break-all text-muted-foreground">
          目标 {mention.targetUrl} · 接收于 {formatLocalDate(new Date(mention.createdAt), ADMIN_DATE_FORMAT, config)}
        </p>
        <span className="ml-auto flex shrink-0 gap-2">
          {showReverify && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReverify(mention)}>
              <RefreshCwIcon /> 重新验证
            </Button>
          )}
          {mention.status === 'pending' && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(mention)}>
                <CheckIcon /> 批准
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(mention)}>
                <XIcon /> 拒绝
              </Button>
            </>
          )}
          {mention.status === 'hidden' && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReject(mention)}>
              <XIcon /> 拒绝
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

// The moderation queue: mentions land as `pending` after source verification
// and only reach the public page once approved; rejection is kept (audit trail);
// 7 consecutive daily verification failures flip an approved row to `hidden`.
export function WebmentionInboxView() {
  const [status, setStatus] = useState<StatusFilter>('all')

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef, patchPages } = useAdminInfiniteList({
    namespace: orpcQuery.admin.webmentions.loadAll,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      status: status === 'all' ? undefined : status,
      offset,
      limit: PAGE_SIZE,
    }),
    selectRows: (page) => page.mentions,
    noun: 'Webmention',
  })

  const approveMutation = useMutation({
    ...orpcQuery.admin.webmentions.approve.mutationOptions(),
    onSuccess: (_result, variables) =>
      patchPages((data) => moderateMentionInPages(data, variables.id, 'approved', status)),
    onError: onMutationError('批准 Webmention 失败'),
  })
  const rejectMutation = useMutation({
    ...orpcQuery.admin.webmentions.reject.mutationOptions(),
    onSuccess: (_result, variables) =>
      patchPages((data) => moderateMentionInPages(data, variables.id, 'rejected', status)),
    onError: onMutationError('拒绝 Webmention 失败'),
  })
  const reverifyMutation = useMutation({
    ...orpcQuery.admin.webmentions.reverify.mutationOptions(),
    onSuccess: (row) => patchPages((data) => applyReverifyToPages(data, row, status)),
    onError: onMutationError('重新验证失败'),
  })

  const isBusy = (mention: AdminWebmentionWire) =>
    (approveMutation.isPending && approveMutation.variables?.id === mention.id) ||
    (rejectMutation.isPending && rejectMutation.variables?.id === mention.id) ||
    (reverifyMutation.isPending && reverifyMutation.variables?.id === mention.id)

  return (
    <>
      <AdminListPage.Toolbar>
        <Tabs
          value={status}
          onValueChange={(value: unknown) => {
            if (isStatusFilter(value)) {
              setStatus(value)
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="pending">待审核</TabsTrigger>
            <TabsTrigger value="approved">已批准</TabsTrigger>
            <TabsTrigger value="rejected">已拒绝</TabsTrigger>
            <TabsTrigger value="hidden">已隐藏</TabsTrigger>
          </TabsList>
        </Tabs>
      </AdminListPage.Toolbar>

      <AdminListPage.Body>
        {!isLoading && rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AtSignIcon />
              </EmptyMedia>
              <EmptyTitle>暂无收到的 Webmention</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {rows.map((mention) => (
              <InboxRow
                key={mention.id}
                mention={mention}
                onApprove={(m) => approveMutation.mutate({ id: m.id })}
                onReject={(m) => rejectMutation.mutate({ id: m.id })}
                onReverify={(m) => reverifyMutation.mutate({ id: m.id })}
                isBusy={isBusy}
              />
            ))}
          </div>
        )}
        <div ref={sentinelRef} />
        <AdminInfiniteListFooter
          noun="条 Webmention"
          rowCount={total}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </AdminListPage.Body>
    </>
  )
}
