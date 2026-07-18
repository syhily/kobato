import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileTextIcon,
  ListChecksIcon,
  LoaderIcon,
  RotateCcwIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import type { MyCommentItem } from '@/routes/admin/me/comments'
import type { MyCommentsStatus } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { commentBodySchema } from '@/shared/pt/comment-schema'
import { formatLocalDate } from '@/shared/utils/formatter'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { CommentsFilterBar } from '@/ui/admin/comments/CommentsFilterBar'
import { type FieldDefinition } from '@/ui/admin/comments/filter-constants'
import {
  DEFAULT_TEXT_OPERATOR,
  textFilterLabel,
  type ActiveFilter,
  type FilterFieldKey,
  type FilterItem,
} from '@/ui/admin/comments/useCommentsController'
import { MyEditCommentDialog } from '@/ui/admin/my/MyEditCommentDialog'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'
import { PortableTextBody } from '@/ui/pt/render'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'
const PAGE_SIZE = 20
const FILTER_QUERY_DEBOUNCE_MS = 250

const MY_COMMENT_FIELDS: FieldDefinition[] = [
  { key: 'status', label: '状态', icon: ListChecksIcon },
  { key: 'page', label: '文章', icon: FileTextIcon },
  { key: 'text', label: '内容', icon: SearchIcon },
]

const MY_STATUS_OPTIONS: { value: Exclude<MyCommentsStatus, 'all'>; label: string }[] = [
  { value: 'pending', label: '待审' },
  { value: 'deleteRequested', label: '申请删除' },
  { value: 'deleted', label: '已删除' },
]

export interface MyCommentEntityOption {
  value: string
  label: string
}

export interface MyCommentsViewProps {
  status: MyCommentsStatus
  q: string
  /** `${type}:${ownerId}` if the URL pins a specific post / page, else null. */
  entity: string | null
  /**
   * Posts / pages the user has commented on, plus the currently-selected
   * entity (when the URL pins one that isn't in the capped result set).
   */
  entityOptions: MyCommentEntityOption[]
  currentUser: { id: string; name: string; email: string }
}

function buildActiveFilters({
  status,
  q,
  entity,
  entityOptions,
}: {
  status: MyCommentsStatus
  q: string
  entity: string | null
  entityOptions: MyCommentEntityOption[]
}): ActiveFilter[] {
  const filters: ActiveFilter[] = []
  if (status !== 'all') {
    const label = MY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
    filters.push({ field: 'status', value: status, label })
  }
  if (entity) {
    const match = entityOptions.find((o) => o.value === entity)
    filters.push({ field: 'page', value: entity, label: match?.label ?? entity })
  }
  if (q.trim()) {
    const value = JSON.stringify({ op: DEFAULT_TEXT_OPERATOR, value: q.trim() })
    filters.push({ field: 'text', value, label: textFilterLabel({ op: DEFAULT_TEXT_OPERATOR, value: q.trim() }) })
  }
  return filters
}

export function MyCommentsView({ status, q, entity, entityOptions, currentUser }: MyCommentsViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const [textFilterDraft, setTextFilterDraft] = useState<ActiveFilter | null>(null)
  const [debouncedEntityQuery, setDebouncedEntityQuery] = useState('')
  const [, setEntityQuery] = useDebouncedSearch({
    delayMs: FILTER_QUERY_DEBOUNCE_MS,
    onChange: (value) => setDebouncedEntityQuery(value),
  })

  const { data: entitiesData, isLoading: isEntitiesPending } = useQuery(
    orpcQuery.comments.searchMineEntities.queryOptions({
      input: debouncedEntityQuery ? { q: debouncedEntityQuery } : {},
      enabled: debouncedEntityQuery !== '',
    }),
  )

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
      // Use React Router's setSearchParams so the loader re-runs and the
      // component props (status/q/entity) stay in sync with the URL.
      // `replace: true` keeps the history stack clean; `preventScrollReset`
      // avoids the page jumping back to the top on every filter change.
      setSearchParams(next, { replace: true, preventScrollReset: true })
    },
    [searchParams, setSearchParams],
  )

  const filters = useMemo(() => {
    const base = buildActiveFilters({ status, q, entity, entityOptions })
    if (textFilterDraft && !base.some((f) => f.field === 'text')) {
      return [...base, textFilterDraft]
    }
    return base
  }, [status, q, entity, entityOptions, textFilterDraft])

  const pageItems: FilterItem[] = useMemo(() => {
    // When the user is actively searching, prefer the live search results.
    // Otherwise fall back to the loader-provided entity list so the dropdown
    // isn't empty on first open.
    const fetched = debouncedEntityQuery
      ? (entitiesData?.entities ?? [])
      : entityOptions.map((o) => ({ value: o.value, label: o.label }))
    const items = fetched.map((e) => ({ value: e.value, label: e.label }))
    const current = entity
      ? { value: entity, label: entityOptions.find((o) => o.value === entity)?.label ?? entity }
      : null
    if (current && !items.some((i) => i.value === current.value)) {
      items.unshift(current)
    }
    return items
  }, [debouncedEntityQuery, entitiesData, entity, entityOptions])

  const handleRemoveFilter = useCallback(
    (field: FilterFieldKey) => {
      if (field === 'status') {
        updateParams({ status: null })
      } else if (field === 'page') {
        updateParams({ entity: null })
      } else if (field === 'text') {
        setTextFilterDraft(null)
        updateParams({ q: null })
      }
    },
    [updateParams],
  )

  const handleAddFilter = useCallback(
    (field: FilterFieldKey, value: string, _label: string) => {
      if (field === 'status') {
        updateParams({ status: value === 'all' ? null : value })
      } else if (field === 'page') {
        updateParams({ entity: value })
      } else if (field === 'text') {
        try {
          const parsed = unsafeCast<{ value?: string; op?: string }>(JSON.parse(value))
          const text = parsed.value?.trim() ?? ''
          // Always show the pill via the draft so the user can type into it.
          // Sync the URL in both directions: non-empty text sets q, empty text
          // clears it (so the result list isn't filtered by a stale value).
          setTextFilterDraft({ field: 'text', value, label: _label })
          updateParams({ q: text })
        } catch {
          // ignore malformed value
        }
      }
    },
    [updateParams],
  )

  const handleClearFilters = useCallback(() => {
    setTextFilterDraft(null)
    updateParams({ status: null, entity: null, q: null })
  }, [updateParams])

  const listQuery = useInfiniteQuery(
    orpcQuery.comments.loadMine.infiniteOptions({
      input: (pageParam: number) => ({
        offset: pageParam,
        limit: PAGE_SIZE,
        ...(status !== 'all' ? { status } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(entity ? { entity } : {}),
      }),
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        if (!lastPage.hasMore) {
          return undefined
        }
        return (lastPageParam ?? 0) + PAGE_SIZE
      },
      initialPageParam: 0,
    }),
  )

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = listQuery
  const items = useMemo(() => listQuery.data?.pages.flatMap((page) => page.items) ?? [], [listQuery.data])
  const total = listQuery.data?.pages[0]?.total ?? 0

  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载评论失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.comments.loadMine.key() })
  }, [queryClient])

  const requestDelete = useMutation({
    ...orpcQuery.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: (error) => {
      toast.error('申请删除失败', { description: error.message })
    },
  })
  const cancelDelete = useMutation({
    ...orpcQuery.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: (error) => {
      toast.error('撤回删除申请失败', { description: error.message })
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

  const filterBar = (
    <CommentsFilterBar
      filters={filters}
      onAddFilter={handleAddFilter}
      onRemoveFilter={handleRemoveFilter}
      onClearFilters={handleClearFilters}
      pageItems={pageItems}
      authorItems={[]}
      onPageSearch={setEntityQuery}
      onAuthorSearch={() => undefined}
      isPagesPending={isEntitiesPending}
      fields={MY_COMMENT_FIELDS}
      statusOptions={MY_STATUS_OPTIONS}
      textFilterOperators={[{ value: DEFAULT_TEXT_OPERATOR, label: '包含' }]}
    />
  )

  const hasActiveFilters = filters.length > 0

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
          <div className="py-6 text-center text-sm text-muted-foreground">
            {isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                加载中…
              </span>
            ) : (
              '已加载全部评论'
            )}
          </div>
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
          <AvatarImage src={`/images/avatar/${currentUser.id}.png`} alt={currentUser.name} />
          <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{initial}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          {/* Header: name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{currentUser.name}</span>
            {item.isPending && <Badge variant="secondary">待审核</Badge>}
            {hasPendingDelete && !isDeleted && <Badge variant="outline">已申请删除</Badge>}
            {isDeleted && <Badge variant="secondary">已删除</Badge>}
          </div>

          {/* Meta: date + page */}
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

          {/* Parent reply hint */}
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

          {/* Body */}
          <div className="comment-content prose-blog prose prose-sm mt-2 max-w-none leading-copy wrap-break-word whitespace-normal">
            <PortableTextBody body={item.body} />
          </div>

          {/* Action row */}
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
