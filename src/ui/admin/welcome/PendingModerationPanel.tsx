import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRightIcon, CheckIcon, LightbulbIcon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminPendingItemDto } from '@/shared/contracts/comments'
import type { ListPendingDashboardOutput } from '@/shared/types/comments'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'

const PAGE_SIZE = 3
const ROW_DATE_FORMAT = 'LL-dd HH:mm'

export interface PendingModerationPanelProps {
  initial: ListPendingDashboardOutput
  emptyStateLine: string
}

export function PendingModerationPanel({ initial, emptyStateLine }: PendingModerationPanelProps) {
  const [offset, setOffset] = useState(0)

  const {
    data,
    isPending: isListPending,
    refetch,
  } = useQuery(
    orpcQuery.admin.comments.listPendingDashboard.queryOptions({
      input: { kind: 'all', offset, limit: PAGE_SIZE },
      initialData: initial,
    }),
  )

  const switchPage = (nextOffset: number) => {
    if (nextOffset === offset || nextOffset < 0) {
      return
    }
    setOffset(nextOffset)
  }

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  const approveApi = useMutation({
    mutationFn: (vars: { commentId: string }) => orpc.admin.comments.approve({ commentId: vars.commentId }),
    onSuccess: () => {
      toast.success('已通过该评论')
      refresh()
    },
    onError: (error) => toastApiError(error, '操作失败，请刷新页面重试'),
  })
  const rejectApi = useMutation({
    mutationFn: (vars: { commentId: string }) => orpc.admin.comments.delete({ commentId: vars.commentId }),
    onSuccess: () => {
      toast.success('已拒绝并删除该评论')
      refresh()
    },
    onError: (error) => toastApiError(error, '操作失败，请刷新页面重试'),
  })
  const approveDeletionApi = useMutation({
    ...orpcQuery.admin.comments.approveCommentDeletion.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data ? '已处理该删除申请' : '已处理')
      refresh()
    },
    onError: (error) => toastApiError(error, '操作失败，请刷新页面重试'),
  })

  const onApprove = (item: AdminPendingItemDto) => {
    approveApi.mutate({ commentId: item.id })
  }
  const onReject = (item: AdminPendingItemDto) => {
    rejectApi.mutate({ commentId: item.id })
  }
  const onApproveDeletion = (item: AdminPendingItemDto) => {
    approveDeletionApi.mutate({ commentId: item.id, approve: true })
  }
  const onRejectDeletion = (item: AdminPendingItemDto) => {
    approveDeletionApi.mutate({ commentId: item.id, approve: false })
  }

  const anyMutationPending =
    approveApi.isPending || rejectApi.isPending || approveDeletionApi.isPending || isListPending

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    // Compact fixed-frame card: exactly five rows + slim chrome; the body is
    // the only scroll container (header / pagination pinned via `shrink-0`).
    <div className="flex min-h-[280px] flex-col rounded-xl border bg-card p-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">
            待审评论 <span className="ml-1 text-base font-normal text-muted-foreground">· {data.counts.all}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">等待审核与作者删除申请合并展示，按时间倒序。</p>
        </div>
        {/* Both header CTAs share the same ghost-button shape so "refresh"
            and "go to full moderation page" read as one inline action group. */}
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={anyMutationPending}>
            <RefreshCwIcon data-icon /> <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" render={<Link to="/admin/comments?status=pending" />}>
            <span className="hidden sm:inline">进入评论管理</span> <ArrowRightIcon data-icon />
          </Button>
        </div>
      </div>

      {/* The only scroll container. `min-h-0` lets the flex parent compute
          available height so the inner `overflow-y-auto` actually engages. */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {data.items.length === 0 ? (
          <EmptyState line={emptyStateLine} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.items.map((item) => (
              <PendingRow
                key={item.id}
                item={item}
                disabled={anyMutationPending}
                onApprove={onApprove}
                onReject={onReject}
                onApproveDeletion={onApproveDeletion}
                onRejectDeletion={onRejectDeletion}
              />
            ))}
          </ul>
        )}
      </div>

      {data.total > PAGE_SIZE && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            共 {data.total} 条 · 第 {currentPage} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => switchPage(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || anyMutationPending}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => switchPage(offset + PAGE_SIZE)}
              disabled={!data.hasMore || anyMutationPending}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface PendingRowProps {
  item: AdminPendingItemDto
  disabled: boolean
  onApprove: (item: AdminPendingItemDto) => void
  onReject: (item: AdminPendingItemDto) => void
  onApproveDeletion: (item: AdminPendingItemDto) => void
  onRejectDeletion: (item: AdminPendingItemDto) => void
}

function PendingRow({ item, disabled, onApprove, onReject, onApproveDeletion, onRejectDeletion }: PendingRowProps) {
  const config = useSiteIdentity()
  const isDeletion = item.kind === 'deletion'
  const timestampIso = isDeletion ? (item.deleteRequestedAtIso ?? item.createdAtIso) : item.createdAtIso
  const timestampLabel = timestampIso ? formatLocalDate(new Date(timestampIso), ROW_DATE_FORMAT, config) : ''
  return (
    // Two-track row: stacks below `sm` so a phone user reads the excerpt first; on `sm+` the buttons float right.
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      {/* Convention: admin layouts stack via flex gap, never `space-*` (boundaries contract test). */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Single metadata line: author · badge · 《post》 · time, muted sm scale with `·` separators. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
          <span className="truncate font-medium text-foreground">{item.authorName}</span>
          {isDeletion ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-xs font-normal">
              等待删除
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
              等待审核
            </Badge>
          )}
          {item.pagePermalink && item.pageTitle ? (
            <>
              <span aria-hidden="true">·</span>
              <Link to={item.pagePermalink} className="truncate text-foreground hover:underline">
                《{item.pageTitle}》
              </Link>
            </>
          ) : (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">（目标已删除）</span>
            </>
          )}
          {timestampLabel && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={timestampIso} className="tabular-nums" title={timestampIso}>
                {timestampLabel}
              </time>
            </>
          )}
        </div>
        <p className="line-clamp-2 leading-snug break-words text-(--text-admin-base) text-foreground">
          {item.excerpt || '（空评论）'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
        {isDeletion ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={disabled}
              onClick={() => onApproveDeletion(item)}
            >
              <Trash2Icon data-icon /> 同意删除
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-ink-4"
              disabled={disabled}
              onClick={() => onRejectDeletion(item)}
            >
              <XIcon data-icon /> 拒绝删除
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" disabled={disabled} onClick={() => onApprove(item)}>
              <CheckIcon data-icon /> 通过评论
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={disabled} onClick={() => onReject(item)}>
              <Trash2Icon data-icon /> 拒绝评论
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function EmptyState({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex size-24 items-center justify-center rounded-full bg-status-warn-bg">
        <LightbulbIcon
          aria-hidden="true"
          strokeWidth={1.4}
          className="size-14 text-status-warn-fg drop-shadow-[0_2px_10px_var(--status-warn-fg)]"
        />
      </div>
      <p className="max-w-md text-(--text-admin-base) text-muted-foreground">{line}</p>
    </div>
  )
}
