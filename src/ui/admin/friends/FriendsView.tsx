import {
  SquarePenIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminFriendDto, DeleteFriendInput } from '@/shared/types/friends'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { safeHref } from '@/shared/utils/safe-url'
import { EditFriendDialog } from '@/ui/admin/friends/EditFriendDialog'
import { useFriendsController } from '@/ui/admin/friends/useFriendsController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Checkbox } from '@/ui/components/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

// Same step ladder the comment moderation and tag tables use, so the
// three admin list pages feel identical when an editor jumps between
// them. 10 is the default (set in `useFriendsController`).
const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

// `EditFriendDialog`'s prop discriminator:
//   undefined → dialog closed
//   null      → dialog open in "new friend" mode
//   AdminFriendDto → dialog open in "edit existing" mode
type EditTarget = AdminFriendDto | null | undefined

export function FriendsView() {
  const { state, dispatch } = useFriendsController()
  const [editTarget, setEditTarget] = useState<EditTarget>(undefined)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const listQuery = useQuery(
    orpcQuery.admin.friends.list.queryOptions({
      input: {
        q: state.q || undefined,
        includeHidden: state.includeHidden ? true : undefined,
        offset: state.currentPage * state.pageSize,
        limit: state.pageSize,
      },
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      dispatch({
        type: 'loaded',
        rows: listQuery.data.friends,
        total: listQuery.data.total,
        hasMore: listQuery.data.hasMore,
      })
    }
  }, [listQuery.data, dispatch])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载友链列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isListPending = listQuery.isFetching

  const reload = useCallback(() => {
    void listQuery.refetch()
  }, [listQuery])

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
  const totalPages = useMemo(() => Math.max(1, Math.ceil(state.total / state.pageSize)), [state.total, state.pageSize])

  // The visible/hidden split was previously computed from `state.rows`
  // (the full list pre-pagination). Now `state.rows` only holds the
  // current page, so the split would only describe the current
  // 10-row slice — misleading. Drop the breakdown from the header
  // and let the "包含已隐藏友链" toggle remain the single source of
  // truth for what's in scope.

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title="友链管理" description={`共 ${state.total} 条。公共页面以随机顺序展示。`}>
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isListPending}>
            <RefreshCwIcon /> 刷新
          </Button>
          <Button type="button" onClick={() => setEditTarget(null)}>
            <PlusIcon /> 新增友链
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          {/*
           * 4-col grid: the search input keeps two cols (it's the
           * filter that benefits most from the extra width on narrow
           * viewports), then the visibility-scope toggle and the
           * per-page selector each take one col on `sm:`+. Mirrors
           * the moderation page's toolbar shape.
           */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <AdminListPage.FilterField label="搜索（站名 / 简介 / 主页）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    placeholder="输入站名、简介或主页 URL 关键字"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
            <AdminListPage.FilterField label="显示选项">
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="friends-include-hidden"
                  checked={state.includeHidden}
                  onCheckedChange={(value) => dispatch({ type: 'setIncludeHidden', value: value === true })}
                />
                <label htmlFor="friends-include-hidden" className="text-sm select-none">
                  包含已隐藏友链
                </label>
              </div>
            </AdminListPage.FilterField>
            <AdminListPage.FilterField label="每页显示">
              <Select
                items={PAGE_SIZE_OPTIONS}
                value={String(state.pageSize)}
                onValueChange={(value) => dispatch({ type: 'setPageSize', value: Number.parseInt(value ?? '10', 10) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminListPage.FilterField>
          </div>
        </AdminListPage.Toolbar>

        <AdminListPage.Body>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">封面</TableHead>
                  <TableHead>站点</TableHead>
                  <TableHead className="hidden lg:table-cell">简介</TableHead>
                  <TableHead className="text-center">状态</TableHead>
                  <TableHead className="w-12 pr-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <FriendsSkeleton />
                ) : state.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <SearchIcon />
                          </EmptyMedia>
                          <EmptyTitle>未找到友链</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  state.rows.map((row) => (
                    <FriendRow
                      key={row.id}
                      friend={row}
                      onEdit={() => setEditTarget(row)}
                      onDelete={() =>
                        setConfirm({
                          title: `删除友链「${row.website}」？`,
                          description:
                            '此操作会从数据库直接删除该友链。如果只是临时下线，请改为编辑后取消「在公共页面显示」。',
                          actionLabel: '删除',
                          destructive: true,
                          onConfirm: () => {
                            dispatch({ type: 'removeFriend', id: row.id })
                            submitDelete({ id: row.id })
                          },
                        })
                      }
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </AdminListPage.Body>

        <AdminListPage.PageNavigation
          totalPages={totalPages}
          currentPage={state.currentPage}
          onChange={(page) => dispatch({ type: 'setCurrentPage', value: page })}
        />
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

interface FriendRowProps {
  friend: AdminFriendDto
  onEdit: () => void
  onDelete: () => void
}

function FriendRow({ friend, onEdit, onDelete }: FriendRowProps) {
  const homepageHref = safeHref(friend.homepage)
  return (
    <TableRow>
      <TableCell>
        {/* Plain <img> instead of the public `<Image>` primitive: the
            admin list is a low-frequency view and we'd rather not
            depend on the localization context (`asset.host`) for
            something this small — the friend's `poster` is already
            an absolute URL, and the browser handles the lazy
            decoding. */}
        <img
          src={friend.poster}
          alt={friend.website}
          loading="lazy"
          decoding="async"
          className="h-10 w-20 rounded border bg-muted object-cover"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{friend.website}</span>
          {homepageHref && (
            <a
              href={homepageHref}
              target="_blank"
              rel="nofollow noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3" />
              <span className="max-w-xs truncate">{friend.homepage}</span>
            </a>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="line-clamp-2 text-sm text-muted-foreground">{friend.description || '—'}</span>
      </TableCell>
      <TableCell className="text-center">
        {friend.visible ? (
          <Badge variant="secondary" className="gap-1">
            <EyeIcon className="size-3" /> 显示
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <EyeOffIcon className="size-3" /> 隐藏
          </Badge>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="ghost" size="icon" aria-label="更多操作">
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <SquarePenIcon /> 编辑
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function FriendsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        // Skeleton rows — identical placeholders, swapped wholesale on load.
        // oxlint-disable-next-line react/no-array-index-key
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-10 w-20 rounded" />
          </TableCell>
          <TableCell colSpan={4}>
            <Skeleton className="h-4 w-1/3" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
