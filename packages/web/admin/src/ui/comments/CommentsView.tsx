import type { AdminCommentWire as AdminComment } from '@kobato/contracts/comments'
import type { ActiveFilter } from '@kobato/web-admin/ui/shared/filter-bar/filter-pills-reducer'

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { skeletonKeys } from '@kobato/ui/lib/skeleton-keys'
import { idStr } from '@kobato/utils/id'
import { AdminCommentRow } from '@kobato/web-admin/ui/comments/AdminCommentRow'
import { EditCommentDialog } from '@kobato/web-admin/ui/comments/EditCommentDialog'
import { EditUserDialog } from '@kobato/web-admin/ui/comments/EditUserDialog'
import {
  buildCommentFilterFields,
  type CommentFilterFieldKey,
  type CommentsFilterQuery,
} from '@kobato/web-admin/ui/comments/filter-fields'
import { ReplyCommentDialog } from '@kobato/web-admin/ui/comments/ReplyCommentDialog'
import { useCommentsController } from '@kobato/web-admin/ui/comments/use-comments-controller'
import { ConfirmDialog } from '@kobato/web-admin/ui/shared/ConfirmDialog'
import { FilterPillBar } from '@kobato/web-admin/ui/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@kobato/web-admin/ui/shared/filter-bar/use-filter-pills'
import { AdminInfiniteListFooter } from '@kobato/web-admin/ui/shared/list/AdminInfiniteListFooter'
import { AdminListPage } from '@kobato/web-admin/ui/shared/list/AdminListPage'
import { SearchIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

export interface CommentsViewProps {
  currentUserName: string
  currentUserEmail: string
  initialFilters: ActiveFilter<CommentFilterFieldKey>[]
}

export function CommentsView({ currentUserName, currentUserEmail, initialFilters }: CommentsViewProps) {
  const { t } = useI18n()
  const [editTarget, setEditTarget] = useState<AdminComment | null>(null)
  const [replyTarget, setReplyTarget] = useState<AdminComment | null>(null)
  const [editUserTarget, setEditUserTarget] = useState<AdminComment | null>(null)

  const fields = useMemo(() => buildCommentFilterFields(t), [t])
  const pills = useFilterPills({ fields, initial: initialFilters })

  const {
    comments,
    hasMore,
    isLoading,
    isFetchingNextPage,
    sentinelRef,
    actions,
    confirm,
    closeConfirm,
    updateCommentBody,
    invalidateList,
  } = useCommentsController({
    filters: pills.filters,
    dispatch: pills.dispatch,
    queryInput: pills.queryInput<CommentsFilterQuery>(),
    intents: {
      edit: setEditTarget,
      reply: setReplyTarget,
      editUser: setEditUserTarget,
    },
  })

  const parentLookup = useMemo(() => new Map(comments.map((c) => [idStr(c.id), c])), [comments])

  const hasActiveFilters = pills.hasFilters

  const filterBar = <FilterPillBar {...pills.bar} />

  return (
    <>
      <AdminListPage>
        <AdminListPage.Header title={t('admin.comments.title')} description={t('admin.comments.description')}>
          <div className="flex items-center gap-2">{!hasActiveFilters && filterBar}</div>
        </AdminListPage.Header>

        {hasActiveFilters && filterBar}

        <AdminListPage.Body>
          <div className="divide-y">
            {isLoading ? (
              <CommentsSkeleton />
            ) : comments.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('admin.comments.empty')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              comments.map((comment, index) =>
                index === comments.length - 1 ? (
                  <Fragment key={idStr(comment.id)} ref={sentinelRef}>
                    <AdminCommentRow comment={comment} parentLookup={parentLookup} actions={actions} />
                  </Fragment>
                ) : (
                  <AdminCommentRow
                    key={idStr(comment.id)}
                    comment={comment}
                    parentLookup={parentLookup}
                    actions={actions}
                  />
                ),
              )
            )}
          </div>

          {(isFetchingNextPage || (!hasMore && comments.length > 0)) && (
            <AdminInfiniteListFooter
              noun={t('admin.list.noun.comments')}
              rowCount={comments.length}
              hasNextPage={hasMore}
              isFetchingNextPage={isFetchingNextPage}
            />
          )}
        </AdminListPage.Body>
      </AdminListPage>

      <EditCommentDialog
        comment={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(c) => {
          if (editTarget) {
            updateCommentBody(idStr(editTarget.id), c.body, c.content)
          }
          setEditTarget(null)
        }}
      />
      <EditUserDialog
        comment={editUserTarget}
        onClose={() => setEditUserTarget(null)}
        onSaved={() => {
          setEditUserTarget(null)
          invalidateList()
        }}
      />
      <ReplyCommentDialog
        comment={replyTarget}
        authorName={currentUserName || t('common.role.admin')}
        authorEmail={currentUserEmail}
        onClose={() => setReplyTarget(null)}
        onReplied={() => {
          setReplyTarget(null)
          invalidateList()
        }}
      />

      <ConfirmDialog state={confirm} onClose={closeConfirm} />
    </>
  )
}

function CommentsSkeleton() {
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
