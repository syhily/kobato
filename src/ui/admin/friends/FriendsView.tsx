import { useMutation, useQuery } from '@tanstack/react-query'
import { LoaderIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { AdminFriendDto, DeleteFriendInput } from '@/shared/types/friends'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { FriendRow, FriendsSkeleton } from '@/ui/admin/friends/FriendRow'
import { PAGE_SIZE, useFriendsController } from '@/ui/admin/friends/useFriendsController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Checkbox } from '@/ui/components/checkbox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'

type EditTarget = AdminFriendDto | null | undefined

export function FriendsView() {
  const { state, dispatch } = useFriendsController()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const {
    data: listData,
    isPending: isListPending,
    error: listError,
  } = useQuery(
    orpcQuery.admin.friends.list.queryOptions({
      input: {
        q: state.q || undefined,
        includeHidden: state.includeHidden ? true : undefined,
        offset: 0,
        limit: PAGE_SIZE,
      },
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({
        type: 'loaded',
        rows: listData.friends,
        total: listData.total,
        hasMore: listData.hasMore,
      })
    }
  }, [listData, dispatch])

  useEffect(() => {
    if (listError) {
      toast.error('加载友链列表失败', { description: listError.message })
    }
  }, [listError])

  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = state.hasMore

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.friends.list({
        q: state.q || undefined,
        includeHidden: state.includeHidden ? true : undefined,
        offset: state.rows.length,
        limit: PAGE_SIZE,
      })
      dispatch({
        type: 'appended',
        rows: result.friends,
        total: result.total,
        hasMore: result.hasMore,
      })
    } catch (err) {
      toast.error('加载更多友链失败', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, state.q, state.includeHidden, state.rows.length, dispatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteFriendInput) => orpc.admin.friends.delete({ id: input.id }),
    onError: (error) => {
      toast.error('删除友链失败', { description: error.message })
    },
  })
  const submitDelete = deleteMutation.mutate

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0
  const isDialogOpen = editTarget !== undefined

  const handleDelete = useCallback(
    (row: AdminFriendDto) => {
      setConfirm({
        title: `删除友链「${row.website}」？`,
        description: '此操作会从数据库直接删除该友链。如果只是临时下线，请改为编辑后取消「在公共页面显示」。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => {
          dispatch({ type: 'removeFriend', id: row.id })
          submitDelete({ id: row.id })
        },
      })
    },
    [dispatch, submitDelete],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              友链管理 <span className="text-sm font-normal text-muted-foreground">{state.total}</span>
            </>
          }
          description="公共页面以随机顺序展示。"
        >
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="搜索站名、简介或主页 URL…"
                aria-label="搜索友链"
                className="h-9 w-full rounded-xl border border-input bg-transparent py-1 pr-3 pl-9 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-input px-3">
              <Checkbox
                id="friends-include-hidden"
                checked={state.includeHidden}
                onCheckedChange={(value) => dispatch({ type: 'setIncludeHidden', value: value === true })}
              />
              <label htmlFor="friends-include-hidden" className="text-sm select-none">
                包含已隐藏
              </label>
            </div>
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              disabled={isDialogOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius) bg-primary px-3 font-medium text-(--text-admin-sm) text-primary-foreground shadow-none hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon className="size-4" />
              新增友链
            </button>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          {isLoading ? (
            <FriendsSkeleton />
          ) : state.rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>未找到友链</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y rounded-xl border">
              {state.rows.map((row) => (
                <FriendRow
                  key={row.id}
                  friend={row}
                  disabled={isDialogOpen}
                  onEdit={() => setEditTarget(row)}
                  onDelete={() => handleDelete(row)}
                />
              ))}
            </div>
          )}

          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="h-1" />}

          {/* Bottom status */}
          <div className="py-6 text-center text-sm text-muted-foreground">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                加载中…
              </span>
            ) : !hasMore && state.rows.length > 0 ? (
              '已加载全部友链'
            ) : null}
          </div>
        </AdminListPage.Body>
      </AdminListPage>

      <EditFriendDialog
        friend={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={(saved) => {
          // `editTarget === null` was a "new" submission → prepend so
          // the just-created row appears at the top of the
          // newest-first list. Otherwise it's an edit → patch in place.
          if (editTarget === null) {
            dispatch({ type: 'prependFriend', friend: saved })
          } else {
            dispatch({ type: 'patchFriend', friend: saved })
          }
          setEditTarget(undefined)
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
