import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcwIcon, SearchIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { MyCommentItem } from '@/routes/admin/me/comments'
import type { MyCommentsStatus } from '@/shared/types/comments'
import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
import {
  DEFAULT_TEXT_OPERATOR,
  parseTextFilter,
  textFilterLabel,
  type TextFilterValue,
} from '@/ui/admin/comments/filter-fields'
import {
  buildMyCommentFilterFields,
  MY_STATUS_OPTIONS,
  type MyCommentFilterFieldKey,
} from '@/ui/admin/my/filter-fields'
import { MyEditCommentDialog } from '@/ui/admin/my/MyEditCommentDialog'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { FilterPillBar } from '@/ui/admin/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'
import { PortableTextBody } from '@/ui/pt/render'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'
const PAGE_SIZE = 20

export interface MyCommentEntityOption {
  value: string
  label: string
}

export interface MyCommentsViewProps {
  status: MyCommentsStatus
  q: string
  /** `${type}:${ownerId}` if the URL pins a specific post / page, else null. */
  entity: string | null
  /** Posts / pages the user commented on, plus the currently-selected entity (when the URL pins one outside the capped set). */
  entityOptions: MyCommentEntityOption[]
  currentUser: { id: string; name: string; email: string }
}

export function MyCommentsView({ status, q, entity, entityOptions, currentUser }: MyCommentsViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      }
      // setSearchParams re-runs the loader; `replace` keeps history clean, `preventScrollReset` avoids jumping.
      setSearchParams(next, { replace: true, preventScrollReset: true })
    },
    [searchParams, setSearchParams],
  )

  // URL is the source of truth: pills run controlled over the loader props; every action maps back onto the params.
  const filtersFromUrl = useMemo<ActiveFilter<MyCommentFilterFieldKey>[]>(() => {
    const filters: ActiveFilter<MyCommentFilterFieldKey>[] = []
    if (status !== 'all') {
      const label = MY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
      filters.push({ field: 'status', value: status, label })
    }
    if (entity) {
      const match = entityOptions.find((o) => o.value === entity)
      filters.push({ field: 'page', value: entity, label: match?.label ?? entity })
    }
    if (q.trim()) {
      const value: TextFilterValue = { op: DEFAULT_TEXT_OPERATOR, value: q.trim() }
      filters.push({ field: 'text', value: JSON.stringify(value), label: textFilterLabel(value) })
    }
    return filters
  }, [status, q, entity, entityOptions])

  const fields = useMemo(() => buildMyCommentFilterFields(entityOptions), [entityOptions])

  // Pill action → URL patch; an empty text pill maps to q: null and survives locally until the URL re-validates.
  const syncUrl = useCallback(
    (_next: ActiveFilter<MyCommentFilterFieldKey>[], action: FilterPillsAction<MyCommentFilterFieldKey>) => {
      switch (action.type) {
        case 'addFilter':
          if (action.field === 'status') {
            updateParams({ status: action.value === 'all' ? null : action.value })
          } else if (action.field === 'page') {
            updateParams({ entity: action.value })
          } else if (action.field === 'text') {
            const text = parseTextFilter(action.value)?.value.trim() ?? ''
            updateParams({ q: text || null })
          }
          break
        case 'removeFilter':
          if (action.field === 'status') {
            updateParams({ status: null })
          } else if (action.field === 'page') {
            updateParams({ entity: null })
          } else if (action.field === 'text') {
            updateParams({ q: null })
          }
          break
        case 'clearFilters':
          updateParams({ status: null, entity: null, q: null })
          break
        case 'renameFilter':
          break
      }
    },
    [updateParams],
  )

  const pills = useFilterPills({ fields, value: filtersFromUrl, onChange: syncUrl })

  const {
    rows: items,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useAdminInfiniteList({
    namespace: orpcQuery.comments.loadMine,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      offset,
      limit: PAGE_SIZE,
      ...(status !== 'all' ? { status } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(entity ? { entity } : {}),
    }),
    selectRows: (page) => page.items,
    noun: '评论',
  })

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.comments.loadMine.key() })
  }, [queryClient])

  const requestDelete = useMutation({
    ...orpcQuery.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: (error) => {
      toastApiError(error, '申请删除失败')
    },
  })
  const cancelDelete = useMutation({
    ...orpcQuery.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: (error) => {
      toastApiError(error, '撤回删除申请失败')
    },
  })

  const submitting = requestDelete.isPending || cancelDelete.isPending

  const onRequestDelete = useCallback(
    (id: string) => {
      requestDelete.mutate({ commentId: id })
    },
    [requestDelete],
  )
  const onCancelDelete = useCallback(
    (id: string) => {
      cancelDelete.mutate({ commentId: id })
    },
    [cancelDelete],
  )

  const [editTarget, setEditTarget] = useState<MyCommentItem | null>(null)

  const filterBar = <FilterPillBar {...pills.bar} />

  const hasActiveFilters = pills.hasFilters

  return (
    <AdminListPage>
      <AdminListPage.Header title="我的评论" description="查看与管理我发表的全部评论。">
        {/* Header slot only when no filters are active — body slot below takes over otherwise. */}
        <div className="flex items-center gap-2">{!hasActiveFilters && filterBar}</div>
      </AdminListPage.Header>

      {hasActiveFilters && filterBar}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{total}</span> 条评论
        </div>
      </div>

      <AdminListPage.Body>
        <div className="divide-y">
          {isLoading ? (
            <MyCommentsSkeleton />
          ) : items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>暂无评论</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            items.map((item) => (
              <MyCommentRow
                key={item.id}
                item={item}
                currentUser={currentUser}
                submitting={submitting}
                onEdit={() => setEditTarget(item)}
                onRequestDelete={onRequestDelete}
                onCancelDelete={onCancelDelete}
              />
            ))
          )}
        </div>

        {hasNextPage && <div ref={sentinelRef} className="h-1" />}
        {(isFetchingNextPage || (!hasNextPage && items.length > 0)) && (
          <AdminInfiniteListFooter
            noun="评论"
            rowCount={items.length}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        )}
      </AdminListPage.Body>

      <MyEditCommentDialog
        target={
          editTarget
            ? (() => {
                const parsed = commentBodySchema.safeParse(editTarget.body)
                return parsed.success ? { id: editTarget.id, body: parsed.data } : null
              })()
            : null
        }
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null)
          invalidateList()
        }}
      />
    </AdminListPage>
  )
}

function MyCommentRow({
  item,
  currentUser,
  submitting,
  onEdit,
  onRequestDelete,
  onCancelDelete,
}: {
  item: MyCommentItem
  currentUser: { id: string; name: string; email: string }
  submitting: boolean
  onEdit: () => void
  onRequestDelete: (id: string) => void
  onCancelDelete: (id: string) => void
}) {
  const config = useSiteIdentity()
  const isDeleted = item.deletedAtIso !== null
  const hasPendingDelete = item.deleteRequestedAtIso !== null
  const createdAt = item.createdAtIso ? formatLocalDate(new Date(item.createdAtIso), ADMIN_DATE_FORMAT, config) : ''
  const canEdit = !isDeleted && !hasPendingDelete
  const initial = (currentUser.name || currentUser.email || '?').slice(0, 1).toUpperCase()

  return (
    <div
      data-slot="my-comment-row"
      className="group grid grid-cols-1 gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={avatarImageUrl(currentUser.id)} alt={currentUser.name} />
          <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{initial}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{currentUser.name}</span>
            {item.isPending && <Badge variant="secondary">待审核</Badge>}
            {hasPendingDelete && !isDeleted && <Badge variant="outline">已申请删除</Badge>}
            {isDeleted && <Badge variant="secondary">已删除</Badge>}
          </div>

          <p className="mt-0.5 truncate text-admin-sm text-muted-foreground">
            {createdAt}
            {item.entity && (
              <>
                {' · '}
                <a href={item.entity.permalink} target="_blank" rel="noreferrer" className="hover:text-foreground">
                  {item.entity.title}
                </a>
              </>
            )}
          </p>

          {item.parent && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              回复 <span className="underline-offset-2 hover:underline">{item.parent.name}</span>：
              {item.parent.isDeleted ? (
                <span className="italic">一条已删除的评论</span>
              ) : (
                <span className="text-foreground/70"> “{item.parent.excerpt}”</span>
              )}
            </p>
          )}

          <div className="comment-content prose-blog prose prose-sm mt-2 max-w-none leading-copy wrap-break-word whitespace-normal">
            <PortableTextBody body={item.body} />
          </div>

          {!isDeleted && (
            <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onEdit}
                  disabled={submitting}
                  aria-label="修改评论"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <SquarePenIcon data-icon="sm" />
                  <span className="hidden sm:inline">修改</span>
                </Button>
              )}
              {hasPendingDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onCancelDelete(item.id)}
                  disabled={submitting}
                  aria-label="撤回删除"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcwIcon data-icon="sm" />
                  <span className="hidden sm:inline">撤回删除</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRequestDelete(item.id)}
                  disabled={submitting}
                  aria-label="申请删除"
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2Icon data-icon="sm" />
                  <span className="hidden sm:inline">申请删除</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MyCommentsSkeleton() {
  return (
    <>
      {skeletonKeys(3).map((key) => (
        <div key={key} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </>
  )
}
