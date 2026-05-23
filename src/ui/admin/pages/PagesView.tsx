import {
  FilePenIcon,
  MessageSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { AdminPageDto, DeletePageInput, RestorePageInput } from '@/shared/types/pages'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery, useQueryClient } from '@/client/api/query'
import { usePagesController } from '@/ui/admin/pages/usePagesController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

const DELETED_STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'normal', label: '正常' },
  { value: 'deleted', label: '已删除' },
]

export function PagesView() {
  const queryClient = useQueryClient()
  const { state, dispatch } = usePagesController()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const listQuery = useQuery(
    orpcQuery.admin.pages.list.queryOptions({
      input: {
        q: state.q || undefined,
        deletedStatus: state.deletedStatus,
      },
    }),
  )

  useEffect(() => {
    if (listQuery.data) {
      dispatch({ type: 'loaded', rows: listQuery.data.pages, total: listQuery.data.total })
    }
  }, [listQuery.data, dispatch])

  useEffect(() => {
    if (listQuery.error) {
      toast.error('加载页面列表失败', { description: listQuery.error.message })
    }
  }, [listQuery.error])

  const isListPending = listQuery.isFetching

  const reload = useCallback(() => {
    void listQuery.refetch()
  }, [listQuery])

  const deleteMutation = useMutation({
    mutationFn: (input: DeletePageInput) => orpc.admin.pages.delete({ id: input.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'listPages'] })
    },
    onError: (error) =>
      setConfirm({
        title: '删除失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      }),
  })
  const submitDelete = deleteMutation.mutate

  const restoreMutation = useMutation({
    mutationFn: (input: RestorePageInput) => orpc.admin.pages.restore({ id: input.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'listPages'] })
    },
    onError: (error) =>
      setConfirm({
        title: '恢复失败',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      }),
  })
  const submitRestore = restoreMutation.mutate

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title="页面管理"
          description={`共 ${state.total} 个页面。点击「编辑」可进入富文本编辑器，编辑器右侧可同时调整页面元数据。`}
        >
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isListPending}>
            <RefreshCwIcon /> 刷新
          </Button>
          <Button
            type="button"
            render={
              <Link to="/editor/page/new">
                <PlusIcon /> 新建页面
              </Link>
            }
          />
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <AdminListPage.FilterField label="搜索（slug / 标题）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    placeholder="输入 slug 或标题关键字"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
            <AdminListPage.FilterField label="删除状态">
              <Select
                items={DELETED_STATUS_OPTIONS}
                value={state.deletedStatus}
                onValueChange={(value) =>
                  dispatch({
                    type: 'setDeletedStatus',
                    value: (value ?? 'normal') as 'all' | 'deleted' | 'normal',
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELETED_STATUS_OPTIONS.map((item) => (
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
                  <TableHead className="pl-4">标题</TableHead>
                  <TableHead className="hidden md:table-cell">摘要</TableHead>
                  <TableHead className="hidden w-24 text-center md:table-cell">作者</TableHead>
                  <TableHead className="w-28 text-center">状态</TableHead>
                  <TableHead className="hidden w-44 lg:table-cell">更新时间</TableHead>
                  <TableHead className="w-56 pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <PagesSkeleton />
                ) : state.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <SearchIcon />
                          </EmptyMedia>
                          <EmptyTitle>未找到页面</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  state.rows.map((row) => (
                    <PageRow
                      key={row.id}
                      page={row}
                      onDelete={() =>
                        setConfirm({
                          title: `删除页面「${row.title}」？`,
                          description: '页面会被软删除（30 天内可恢复）。已发布的链接将立即返回 404。',
                          actionLabel: '删除',
                          destructive: true,
                          onConfirm: () => submitDelete({ id: row.id }),
                        })
                      }
                      onRestore={() => submitRestore({ id: row.id })}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </AdminListPage.Body>
      </AdminListPage>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

interface PageRowProps {
  page: AdminPageDto
  onDelete: () => void
  onRestore: () => void
}

function PageRow({ page, onDelete, onRestore }: PageRowProps) {
  const isDeleted = page.deletedAt !== null
  return (
    <TableRow className={isDeleted ? 'opacity-60' : undefined}>
      <TableCell className="pl-4 align-top">
        <div className="font-medium">{page.title}</div>
        <Link
          to={`/${page.slug}`}
          className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          /{page.slug}
        </Link>
      </TableCell>
      <TableCell className="hidden max-w-md md:table-cell">
        <p className="line-clamp-2 text-sm text-muted-foreground">{page.summary || '—'}</p>
      </TableCell>
      <TableCell className="hidden w-24 text-center align-middle md:table-cell">
        <p className="text-sm text-muted-foreground">{page.authorName || '—'}</p>
      </TableCell>
      <TableCell className="text-center align-middle">
        <StatusBadge page={page} />
      </TableCell>
      <TableCell className="hidden align-middle text-sm lg:table-cell">
        {new Date(page.updatedAt).toLocaleString('zh-CN')}
      </TableCell>
      <TableCell className="pr-4 text-right align-top">
        <div className="flex justify-end gap-2">
          {!isDeleted ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="查看评论"
                className="w-20 justify-start"
                render={
                  <Link to={`/admin/comments?pageKey=${encodeURIComponent(page.commentPublicId)}`}>
                    <MessageSquareIcon /> {page.commentCount}
                  </Link>
                }
              />
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link to={`/editor/page/${page.id}`}>
                    <FilePenIcon /> 编辑
                  </Link>
                }
              />
              <Button variant="ghost" size="sm" onClick={onDelete} title="删除">
                <Trash2Icon />
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onRestore} title="恢复">
              <Undo2Icon /> 恢复
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ page }: { page: AdminPageDto }) {
  if (page.deletedAt !== null) {
    return <Badge variant="destructive">已删除</Badge>
  }
  if (!page.published) {
    return <Badge variant="secondary">未发布</Badge>
  }
  if (page.publishedRevisionId === null) {
    return <Badge variant="outline">仅草稿</Badge>
  }
  return <Badge>已发布</Badge>
}

function PagesSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <TableRow key={i}>
          <TableCell className="pl-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-3 w-full" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="mx-auto h-3 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="mx-auto h-5 w-16" />
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <Skeleton className="h-3 w-32" />
          </TableCell>
          <TableCell className="pr-4">
            <Skeleton className="ml-auto h-8 w-32" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
