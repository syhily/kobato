import { useMutation } from '@tanstack/react-query'
import { RefreshCwIcon, RotateCcwIcon, SearchIcon, SquarePenIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useRevalidator, useSearchParams } from 'react-router'

import type { MyCommentEntityOption, MyCommentItem } from '@/routes/admin/me/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { MyCommentsStatus } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { MyEditCommentDialog } from '@/ui/admin/my/MyEditCommentDialog'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardContent } from '@/ui/components/card'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Input } from '@/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Skeleton } from '@/ui/components/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { PortableTextBody } from '@/ui/pt/render'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'

const SEARCH_DEBOUNCE_MS = 250

const PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [10, 20, 50, 100].map((n) => ({
  value: String(n),
  label: `${n} 条`,
}))

interface Counts {
  total: number
  pending: number
  deleteRequested: number
  deleted: number
}

export interface MyCommentsViewProps {
  items: MyCommentItem[]
  counts: Counts
  totalCounts: Counts
  offset: number
  limit: number
  status: MyCommentsStatus
  q: string
  /** `${type}:${ownerId}` if the URL pins a specific post / page, else null. */
  entity: string | null
  /**
   * Posts / pages the user has commented on, plus the currently-selected
   * entity (when the URL pins one that isn't in the capped result set).
   * The Combobox filters this list client-side — the option count is
   * bounded by `MY_COMMENT_ENTITY_LIMIT` server-side, so debouncing a
   * server search isn't worth the complexity here.
   */
  entityOptions: MyCommentEntityOption[]
}

function ClearFilterButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="destructive-soft"
      size="sm"
      onClick={onClick}
      className="h-7 gap-1 px-2 py-0 text-xs"
    >
      <XIcon data-icon="sm" />
      清除
    </Button>
  )
}

export function MyCommentsView({
  items,
  counts,
  totalCounts,
  offset,
  limit,
  status,
  q,
  entity,
  entityOptions,
}: MyCommentsViewProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const revalidator = useRevalidator()

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
      void navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { replace: false })
    },
    [navigate, searchParams],
  )

  const [searchInput, setSearchInput] = useDebouncedSearch({
    initial: q,
    delayMs: SEARCH_DEBOUNCE_MS,
    onChange: (value) => {
      if (value === q) {
        return
      }
      updateParams({ q: value || null, offset: null })
    },
  })

  useEffect(() => {
    setSearchInput(q)
    // We only want to react to loader-driven `q` changes, not to
    // local keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const selectedEntity = useMemo<MyCommentEntityOption | null>(() => {
    if (!entity) {
      return null
    }
    const match = entityOptions.find((o) => o.value === entity)
    return match ?? { value: entity, label: entity }
  }, [entity, entityOptions])

  const requestDelete = useMutation({
    ...orpcQuery.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
    },
  })
  const cancelDelete = useMutation({
    ...orpcQuery.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(counts.total / limit)), [counts.total, limit])
  const currentPage = Math.floor(offset / limit)

  const isLoading = revalidator.state !== 'idle'

  const [editTarget, setEditTarget] = useState<MyCommentItem | null>(null)

  return (
    <AdminListPage>
      <AdminListPage.Header title="我的评论" description="查看与管理我发表的全部评论。">
        <Button
          type="button"
          variant="outline"
          className="border-ink-4"
          onClick={() => void revalidator.revalidate()}
          disabled={revalidator.state !== 'idle'}
        >
          <RefreshCwIcon data-icon="inline-start" /> 刷新
        </Button>
      </AdminListPage.Header>

      <AdminListPage.Toolbar>
        <Tabs
          value={status}
          onValueChange={(value) => {
            updateParams({ status: value === 'all' ? null : value, offset: null })
          }}
        >
          <TabsList>
            <TabsTrigger value="all">全部 · {totalCounts.total}</TabsTrigger>
            <TabsTrigger value="pending">待审 · {totalCounts.pending}</TabsTrigger>
            <TabsTrigger value="deleteRequested">申请删除 · {totalCounts.deleteRequested}</TabsTrigger>
            <TabsTrigger value="deleted">已删除 · {totalCounts.deleted}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AdminListPage.FilterField label="搜索内容">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索我的评论…"
                className="pl-9"
              />
            </div>
          </AdminListPage.FilterField>
          <AdminListPage.FilterField
            label="按文章筛选"
            action={
              selectedEntity ? (
                <ClearFilterButton onClick={() => updateParams({ entity: null, offset: null })} />
              ) : undefined
            }
          >
            <Combobox<MyCommentEntityOption>
              items={entityOptions}
              value={selectedEntity}
              onValueChange={(item) => {
                updateParams({ entity: item ? item.value : null, offset: null })
              }}
            >
              <ComboboxTrigger className="w-full">
                <ComboboxValue placeholder="全部文章" />
              </ComboboxTrigger>
              <ComboboxContent<MyCommentEntityOption>
                inputPlaceholder="搜索文章…"
                emptyMessage={entityOptions.length === 0 ? '暂无可筛选的文章' : '无匹配文章'}
              >
                {(item) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxContent>
            </Combobox>
          </AdminListPage.FilterField>
          <AdminListPage.FilterField label="每页显示">
            <Select
              items={PAGE_SIZE_OPTIONS}
              value={String(limit)}
              onValueChange={(value) => {
                const next = Number.parseInt(value ?? '10', 10)
                updateParams({ limit: String(next), offset: null })
              }}
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
        <div className="flex flex-col gap-3">
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
                submitting={submitting}
                onEdit={() => setEditTarget(item)}
                onRequestDelete={onRequestDelete}
                onCancelDelete={onCancelDelete}
              />
            ))
          )}
        </div>
      </AdminListPage.Body>

      <AdminListPage.PageNavigation
        totalPages={totalPages}
        currentPage={currentPage}
        onChange={(page) => {
          updateParams({ offset: page === 0 ? null : String(page * limit) })
        }}
      />

      <MyEditCommentDialog
        // `MyCommentItem.body` carries the full PortableText dialect for
        // wire-symmetry with the rest of the catalog; comment rows in
        // particular are always validated against the narrower
        // `commentBodySchema` at write time, so the runtime invariant
        // holds and the cast is safe.
        target={editTarget ? { id: editTarget.id, body: editTarget.body as CommentBody } : null}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null)
          void revalidator.revalidate()
        }}
      />
    </AdminListPage>
  )
}

interface MyCommentRowProps {
  item: MyCommentItem
  submitting: boolean
  onEdit: () => void
  onRequestDelete: (id: string) => void
  onCancelDelete: (id: string) => void
}

function MyCommentRow({ item, submitting, onEdit, onRequestDelete, onCancelDelete }: MyCommentRowProps) {
  const config = useSiteIdentity()
  const isDeleted = item.deletedAtIso !== null
  const hasPendingDelete = item.deleteRequestedAtIso !== null
  const createdAt = item.createdAtIso ? formatLocalDate(new Date(item.createdAtIso), ADMIN_DATE_FORMAT, config) : ''
  const canEdit = !isDeleted && !hasPendingDelete

  return (
    <Card data-slot="my-comment-row">
      <CardContent className="flex flex-col gap-3">
        {/*
         * Top row collapses metadata (time + status badges) on the left
         * with the action cluster on the right. Both columns wrap onto
         * their own line under `sm` so a long status badge stack never
         * pushes the action buttons off-screen.
         */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{createdAt}</span>
              {item.isPending && <Badge variant="destructive">待审</Badge>}
              {hasPendingDelete && !isDeleted && <Badge variant="outline">已申请删除</Badge>}
              {isDeleted && <Badge variant="secondary">已删除</Badge>}
            </div>
            <span className="text-sm text-muted-foreground">
              评论于：
              {item.entity ? (
                <a
                  href={item.entity.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:text-primary hover:underline"
                >
                  {item.entity.title}
                </a>
              ) : (
                <span className="text-muted-foreground italic">已删除文章</span>
              )}
            </span>
          </div>
          {!isDeleted && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={onEdit}>
                  <SquarePenIcon data-icon="inline-start" /> 修改
                </Button>
              )}
              {hasPendingDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => onCancelDelete(item.id)}
                >
                  <RotateCcwIcon data-icon="inline-start" /> 撤回删除
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => onRequestDelete(item.id)}
                >
                  <Trash2Icon data-icon="inline-start" /> 申请删除
                </Button>
              )}
            </div>
          )}
        </div>
        {item.parent && (
          <div className="rounded-xl border border-l-4 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {item.parent.isDeleted ? (
              <span className="italic">回复一条已删除的评论</span>
            ) : (
              <>
                <span>回复 </span>
                <span className="font-medium text-foreground">{item.parent.name}</span>
                <span>：{item.parent.excerpt}</span>
              </>
            )}
          </div>
        )}
        <div className="comment-content prose-blog my-2 prose prose-sm mt-3 max-w-none leading-[1.85] wrap-break-word whitespace-normal">
          <PortableTextBody body={item.body} />
        </div>
      </CardContent>
    </Card>
  )
}

function MyCommentsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        // oxlint-disable-next-line react/no-array-index-key
        <Card key={i}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      ))}
    </>
  )
}
