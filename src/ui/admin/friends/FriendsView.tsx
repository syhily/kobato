import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { AdminFriendDto } from '@/shared/contracts/friends'
import type { DeleteFriendInput } from '@/shared/types/friends'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { toastApiError } from '@/client/lib/toast-api-error'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { FriendRow, FriendsSkeleton } from '@/ui/admin/friends/FriendRow'
import { PendingFriendRow } from '@/ui/admin/friends/PendingFriendRow'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Input } from '@/ui/components/input'

const PAGE_SIZE = 30

// A single bounded page is enough for the pending-review bucket.
const PENDING_LIMIT = 50

type EditTarget = AdminFriendDto | null | undefined

export function FriendsView() {
  const [q, setQ] = useState('')
  const [includeHidden, setIncludeHidden] = useState(false)
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Pending bucket: applications arrive as `visible: false` and surface on top for one-click review.
  const pendingQuery = useQuery(
    orpcQuery.admin.friends.list.queryOptions({ input: { visible: false, limit: PENDING_LIMIT } }),
  )
  const pendingRows = pendingQuery.data?.friends ?? []

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.friends.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      q: q || undefined,
      includeHidden: includeHidden ? true : undefined,
      offset,
      limit: PAGE_SIZE,
    }),
    selectRows: (page) => page.friends,
    noun: '友链',
  })

  const invalidateList = useCallback(() => {
    // One procedure key covers both buckets — `.key()` partial-matches every cached input across both operation types.
    void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.friends.list.key() })
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: (input: DeleteFriendInput) => orpc.admin.friends.delete({ id: input.id }),
    onSuccess: () => {
      toast.success('友链已删除')
      invalidateList()
    },
    onError: (error) => {
      toastApiError(error, '删除友链失败')
    },
  })

  // One-click approve flips `visible` via the existing upsert path; rows without a poster can't pass the schema.
  const approveMutation = useMutation({
    mutationFn: (friend: AdminFriendDto) =>
      orpc.admin.friends.upsert({
        id: friend.id,
        website: friend.website,
        description: friend.description,
        homepage: friend.homepage,
        poster: friend.poster,
        rssUrl: friend.rssUrl,
        visible: true,
      }),
    onSuccess: () => {
      toast.success('友链已通过审核')
      invalidateList()
    },
    onError: (error) => {
      toastApiError(error, '通过友链失败')
    },
  })

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => setQ(value),
  })

  const isDialogOpen = editTarget !== undefined

  const handleDelete = useCallback(
    (row: AdminFriendDto) => {
      setConfirm({
        title: `删除友链「${row.website}」？`,
        description: '此操作会从数据库直接删除该友链。如果只是临时下线，请改为编辑后取消「在公共页面显示」。',
        actionLabel: '删除',
        destructive: true,
        onConfirm: () => deleteMutation.mutate({ id: row.id }),
      })
    },
    [deleteMutation],
  )

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title={
            <>
              友链管理 <span className="text-sm font-normal text-muted-foreground">{total}</span>
            </>
          }
          description="公共页面以随机顺序展示。"
        >
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="搜索站名、简介或主页 URL…"
                aria-label="搜索友链"
                className="pl-9"
              />
            </div>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-input px-3">
              <Checkbox
                id="friends-include-hidden"
                checked={includeHidden}
                onCheckedChange={(value) => setIncludeHidden(value === true)}
              />
              <label htmlFor="friends-include-hidden" className="text-sm select-none">
                包含已隐藏
              </label>
            </div>
            <Button type="button" onClick={() => setEditTarget(null)} disabled={isDialogOpen}>
              <PlusIcon />
              新增友链
            </Button>
          </div>
        </AdminListPage.Header>

        <AdminListPage.Body>
          {pendingRows.length > 0 && (
            <section className="mb-6" aria-label="待审核友链申请">
              <h2 className="mb-3 text-admin-base font-semibold">
                待审核申请 <span className="text-sm font-normal text-muted-foreground">{pendingRows.length}</span>
              </h2>
              <div className="divide-y rounded-xl border">
                {pendingRows.map((row) => (
                  <PendingFriendRow
                    key={row.id}
                    friend={row}
                    disabled={isDialogOpen}
                    approving={approveMutation.isPending}
                    onApprove={() => approveMutation.mutate(row)}
                    onEdit={() => setEditTarget(row)}
                    onDelete={() => handleDelete(row)}
                  />
                ))}
              </div>
            </section>
          )}

          {isLoading ? (
            <FriendsSkeleton />
          ) : rows.length === 0 ? (
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
              {rows.map((row) => (
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

          {hasNextPage && <div ref={sentinelRef} className="h-1" />}

          <AdminInfiniteListFooter
            noun="友链"
            rowCount={rows.length}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </AdminListPage.Body>
      </AdminListPage>

      <EditFriendDialog
        friend={editTarget}
        onClose={() => setEditTarget(undefined)}
        onSaved={() => {
          setEditTarget(undefined)
          invalidateList()
        }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
