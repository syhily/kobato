import type { MyCommentItem, MyCommentsStatus } from '@kobato/api/contracts/account/comments'
import type { ReactNode } from 'react'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { avatarImageUrl } from '@kobato/assets/avatar'
import { CommentContentHtml } from '@kobato/inkling/comment/CommentContentHtml'
import { commentEditorStateSchema } from '@kobato/inkling/headless/comment-schema'
import { Avatar, AvatarFallback, AvatarImage } from '@kobato/ui/components/avatar'
import { Badge } from '@kobato/ui/components/badge'
import { Button } from '@kobato/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { skeletonKeys } from '@kobato/ui/lib/skeleton-keys'
import { formatLocalDate } from '@kobato/utils/site-date'
import { useSiteIdentity } from '@kobato/web-kit/ui/lib/blog-settings-context'
import { onMutationError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcwIcon, SearchIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { ActiveFilter, FilterPillsAction } from '@/ui/shared/filter-bar/filter-pills-reducer'

import { buildMyCommentFilterFields, MY_STATUS_OPTIONS, type MyCommentFilterFieldKey } from '@/ui/account/filter-fields'
import { MyEditCommentDialog } from '@/ui/account/MyEditCommentDialog'
import {
  DEFAULT_TEXT_OPERATOR,
  parseTextFilter,
  textFilterLabel,
  type TextFilterValue,
} from '@/ui/comments/filter-fields'
import { FilterPillBar } from '@/ui/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@/ui/shared/filter-bar/use-filter-pills'
import { AdminInfiniteListFooter } from '@/ui/shared/list/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/shared/list/AdminListPage'
import { useAdminInfiniteList } from '@/ui/shared/list/use-admin-infinite-list'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'

function renderCommentCount(chunks: ReactNode[]): ReactNode {
  return <span className="font-medium text-foreground">{chunks}</span>
}

function renderReplyAuthor(chunks: ReactNode[]): ReactNode {
  return <span className="underline-offset-2 hover:underline">{chunks}</span>
}
const PAGE_SIZE = 20

export interface MyCommentEntityOption {
  value: string
  label: string
}

export interface MyCommentsViewProps {
  status: MyCommentsStatus
  q: string
  entity: string | null
  entityOptions: MyCommentEntityOption[]
  currentUser: { id: string; name: string; email: string }
}

export function MyCommentsView({ status, q, entity, entityOptions, currentUser }: MyCommentsViewProps) {
  const { t, tRich } = useI18n()
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
      setSearchParams(next, { replace: true, preventScrollReset: true })
    },
    [searchParams, setSearchParams],
  )

  const filtersFromUrl = useMemo<ActiveFilter<MyCommentFilterFieldKey>[]>(() => {
    const filters: ActiveFilter<MyCommentFilterFieldKey>[] = []
    if (status !== 'all') {
      const labelId = MY_STATUS_OPTIONS.find((o) => o.value === status)?.labelId
      filters.push({ field: 'status', value: status, label: labelId ? t(labelId) : status })
    }
    if (entity) {
      const match = entityOptions.find((o) => o.value === entity)
      filters.push({ field: 'page', value: entity, label: match?.label ?? entity })
    }
    if (q.trim()) {
      const value: TextFilterValue = { op: DEFAULT_TEXT_OPERATOR, value: q.trim() }
      filters.push({ field: 'text', value: JSON.stringify(value), label: textFilterLabel(value, t) })
    }
    return filters
  }, [status, q, entity, entityOptions, t])

  const fields = useMemo(() => buildMyCommentFilterFields(entityOptions, t), [entityOptions, t])

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
    namespace: orpcQuery.account.comments.loadMine,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      offset,
      limit: PAGE_SIZE,
      ...(status !== 'all' ? { status } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(entity ? { entity } : {}),
    }),
    selectRows: (page) => page.items,
    noun: 'admin.list.noun.comments',
  })

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpcQuery.account.comments.loadMine.key() })
  }, [queryClient])

  const requestDelete = useMutation({
    ...orpcQuery.public.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: onMutationError('admin.toast.deleteRequestFailed', t),
  })
  const cancelDelete = useMutation({
    ...orpcQuery.public.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: () => {
      invalidateList()
    },
    onError: onMutationError('admin.toast.deleteRequestWithdrawFailed', t),
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
      <AdminListPage.Header title={t('public.chrome.myComments')} description={t('admin.my.comments.description')}>
        <div className="flex items-center gap-2">{!hasActiveFilters && filterBar}</div>
      </AdminListPage.Header>

      {hasActiveFilters && filterBar}

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {tRich('admin.my.comments.count', {
            count: total,
            num: renderCommentCount,
          })}
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
                <EmptyTitle>{t('admin.my.comments.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            items.map((item, index) => {
              const row = (
                <MyCommentRow
                  item={item}
                  currentUser={currentUser}
                  submitting={submitting}
                  onEdit={() => setEditTarget(item)}
                  onRequestDelete={onRequestDelete}
                  onCancelDelete={onCancelDelete}
                />
              )
              return index === items.length - 1 ? (
                <Fragment key={item.id} ref={sentinelRef}>
                  {row}
                </Fragment>
              ) : (
                <Fragment key={item.id}>{row}</Fragment>
              )
            })
          )}
        </div>

        {(isFetchingNextPage || (!hasNextPage && items.length > 0)) && (
          <AdminInfiniteListFooter
            noun={t('admin.list.noun.comments')}
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
                const parsed = commentEditorStateSchema.safeParse(editTarget.body)
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
  const { t, tRich } = useI18n()
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
            {item.isPending && <Badge variant="secondary">{t('admin.my.comments.pending')}</Badge>}
            {hasPendingDelete && !isDeleted && (
              <Badge variant="outline">{t('admin.my.comments.deleteRequested')}</Badge>
            )}
            {isDeleted && <Badge variant="secondary">{t('admin.my.comments.deleted')}</Badge>}
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
              {tRich('admin.my.comments.replyTo', {
                name: item.parent.name,
                author: renderReplyAuthor,
              })}
              {item.parent.isDeleted ? (
                <span className="italic">{t('admin.my.comments.deletedParent')}</span>
              ) : (
                <span className="text-foreground/70"> “{item.parent.excerpt}”</span>
              )}
            </p>
          )}

          <CommentContentHtml
            content={item.content}
            className="comment-content typeset typeset-comment mt-2 leading-copy wrap-break-word whitespace-normal"
          />

          {!isDeleted && (
            <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onEdit}
                  disabled={submitting}
                  aria-label={t('admin.my.comments.editAria')}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <SquarePenIcon data-icon="sm" />
                  <span className="hidden sm:inline">{t('admin.my.comments.edit')}</span>
                </Button>
              )}
              {hasPendingDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onCancelDelete(item.id)}
                  disabled={submitting}
                  aria-label={t('admin.my.comments.withdrawAria')}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcwIcon data-icon="sm" />
                  <span className="hidden sm:inline">{t('admin.my.comments.withdraw')}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRequestDelete(item.id)}
                  disabled={submitting}
                  aria-label={t('admin.my.comments.requestDeleteAria')}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2Icon data-icon="sm" />
                  <span className="hidden sm:inline">{t('admin.my.comments.requestDelete')}</span>
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
