import { PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { orpc } from '@/client/api/client'
import { orpcQuery, useMutation, useQuery } from '@/client/api/query'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { type ConfirmState, ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { draftFromTag, EMPTY_TAG_DRAFT, TagDisplayRow, TagEditorRow, TagsSkeleton } from '@/ui/admin/tags/TagRows'
import { useTagsController } from '@/ui/admin/tags/useTagsController'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/components/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'

// Same step ladder the comment moderation table uses, so the two
// admin list pages feel identical when an editor jumps between them.
// 10 is the default (set in `useTagsController`) — matches the
// comment moderation default and keeps the initial render small
// even on a ~300-tag corpus.
const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

// Tags admin page orchestrator. Owns fetcher state, the
// edit / create row toggle, and the soft-delete confirmation flow.
// Per-row presentation (display + inline editor + skeleton) lives
// in `./TagRows.tsx` so this file only owns orchestration.
export function TagsView() {
  const { state, dispatch } = useTagsController()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const {
    data: listData,
    isPending: isListPending,
    refetch,
  } = useQuery(
    orpcQuery.admin.tags.list.queryOptions({
      input: {
        q: state.q || undefined,
        offset: state.currentPage * state.pageSize,
        limit: state.pageSize,
      },
    }),
  )

  useEffect(() => {
    if (listData) {
      dispatch({
        type: 'loaded',
        rows: listData.tags,
        total: listData.total,
        hasMore: listData.hasMore,
      })
    }
  }, [listData, dispatch])

  const reload = useCallback(() => {
    void refetch()
  }, [refetch])

  // The fetcher hook's success callback doesn't receive the original
  // request payload, so latch the in-flight delete id into a ref. Once
  // the server confirms the delete, the success handler reads this id
  // and dispatches the row removal — keeping the optimistic UI
  // accurate even if the server rejects with 409 ("still referenced"),
  // because in that case the row stays put and the error message is
  // surfaced through the confirm dialog.
  const pendingDeleteIdRef = useRef<string | null>(null)
  const deleteApi = useMutation({
    mutationFn: (id: string) => orpc.admin.tags.delete({ id }),
    onSuccess: () => {
      const id = pendingDeleteIdRef.current
      pendingDeleteIdRef.current = null
      if (id) {
        dispatch({ type: 'removeTag', id })
      }
    },
    onError: (error) => {
      pendingDeleteIdRef.current = null
      setConfirm({
        title: '无法删除标签',
        description: error.message,
        actionLabel: '我知道了',
        destructive: false,
        onConfirm: () => undefined,
      })
    },
  })

  const [qInput, setQInput] = useDebouncedSearch({
    delayMs: 300,
    onChange: (value) => dispatch({ type: 'setQ', value }),
  })

  const isLoading = isListPending && state.rows.length === 0
  const totalPages = useMemo(() => Math.max(1, Math.ceil(state.total / state.pageSize)), [state.total, state.pageSize])

  const handleStartEdit = useCallback((id: string) => {
    setIsCreating(false)
    setEditingId(id)
  }, [])

  const handleStopEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const handleStartCreate = useCallback(() => {
    setEditingId(null)
    setIsCreating(true)
  }, [])

  const handleStopCreate = useCallback(() => {
    setIsCreating(false)
  }, [])

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header
          title="标签管理"
          description={`共 ${state.total} 个标签。MDX 文章 frontmatter 中的 tags 字段引用这些名称。`}
        >
          <Button type="button" variant="outline" className="border-ink-4" onClick={reload} disabled={isListPending}>
            <RefreshCwIcon /> 刷新
          </Button>
          <Button type="button" onClick={handleStartCreate} disabled={isCreating}>
            <PlusIcon /> 新增标签
          </Button>
        </AdminListPage.Header>

        <AdminListPage.Toolbar>
          {/*
           * 3-col grid mirroring the comment moderation toolbar: the
           * search input occupies cols 1-2 (it's the only filter that
           * regularly needs the extra width on narrow viewports), and
           * the per-page selector sits on the right so admins can
           * tune the page size without scrolling.
           */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <AdminListPage.FilterField label="搜索（名称 / slug）">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    placeholder="输入名称或 URL slug 关键字"
                  />
                </InputGroup>
              </AdminListPage.FilterField>
            </div>
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
                  <TableHead className="w-[28%]">名称</TableHead>
                  <TableHead>URL slug</TableHead>
                  <TableHead className="w-20 text-center">文章</TableHead>
                  <TableHead className="w-[120px] pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isCreating ? (
                  <TagEditorRow
                    initialDraft={EMPTY_TAG_DRAFT}
                    submitLabel="创建"
                    onCancel={handleStopCreate}
                    onSaved={(saved) => {
                      dispatch({ type: 'prependTag', tag: saved })
                      handleStopCreate()
                    }}
                  />
                ) : null}
                {isLoading ? (
                  <TagsSkeleton />
                ) : state.rows.length === 0 && !isCreating ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <SearchIcon />
                          </EmptyMedia>
                          <EmptyTitle>未找到标签</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  state.rows.map((row) =>
                    editingId === row.id ? (
                      <TagEditorRow
                        key={row.id}
                        tagId={row.id}
                        initialDraft={draftFromTag(row)}
                        submitLabel="保存"
                        onCancel={handleStopEdit}
                        onSaved={(saved) => {
                          dispatch({ type: 'patchTag', tag: saved })
                          handleStopEdit()
                        }}
                      />
                    ) : (
                      <TagDisplayRow
                        key={row.id}
                        tag={row}
                        disabled={isCreating || editingId !== null}
                        onEdit={() => handleStartEdit(row.id)}
                        onDelete={() =>
                          setConfirm({
                            title: `删除标签「${row.name}」？`,
                            description:
                              '此操作会从数据库直接删除该标签。如果仍有文章引用此标签，删除将被阻止；请先在 MDX frontmatter 中改写后再删除。',
                            actionLabel: '删除',
                            destructive: true,
                            onConfirm: () => {
                              pendingDeleteIdRef.current = row.id
                              deleteApi.mutate(row.id)
                            },
                          })
                        }
                      />
                    ),
                  )
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

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
