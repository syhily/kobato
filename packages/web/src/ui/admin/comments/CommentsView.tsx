import type { AdminCommentWire as AdminComment } from '@kobato/shared/contracts/comments.ts'
import type { ActiveFilter } from '@kobato/web/ui/admin/shared/filterPillsReducer.ts'

import { idStr } from '@kobato/shared/utils/tools.ts'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty.tsx'
import { Skeleton } from '@kobato/ui/components/skeleton.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { skeletonKeys } from '@kobato/ui/lib/skeleton-keys.ts'
import { AdminCommentRow } from '@kobato/web/ui/admin/comments/AdminCommentRow.tsx'
import { EditCommentDialog } from '@kobato/web/ui/admin/comments/EditCommentDialog.tsx'
import { EditUserDialog } from '@kobato/web/ui/admin/comments/EditUserDialog.tsx'
import {
  buildCommentFilterFields,
  type CommentFilterFieldKey,
  type CommentsFilterQuery,
} from '@kobato/web/ui/admin/comments/filter-fields.ts'
import { ReplyCommentDialog } from '@kobato/web/ui/admin/comments/ReplyCommentDialog.tsx'
import { useCommentsController } from '@kobato/web/ui/admin/comments/useCommentsController.ts'
import { AdminInfiniteListFooter } from '@kobato/web/ui/admin/shared/AdminInfiniteListFooter.tsx'
import { AdminListPage } from '@kobato/web/ui/admin/shared/AdminListPage.tsx'
import { ConfirmDialog } from '@kobato/web/ui/admin/shared/ConfirmDialog.tsx'
import { FilterPillBar } from '@kobato/web/ui/admin/shared/filter-bar/FilterPillBar.tsx'
import { useFilterPills } from '@kobato/web/ui/admin/shared/filter-bar/useFilterPills.ts'
import { SearchIcon } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

export interface CommentsViewProps {
  currentUserName: string
  currentUserEmail: string
  initialFilters: ActiveFilter<CommentFilterFieldKey>[]
}

export function CommentsView({ currentUserName, currentUserEmail, initialFilters }: CommentsViewProps) {
  const { t } = useI18n()
  // Dialog targets stay view-owned so the row never sees the dialogs.
  const [editTarget, setEditTarget] = useState<AdminComment | null>(null)
  const [replyTarget, setReplyTarget] = useState<AdminComment | null>(null)
  const [editUserTarget, setEditUserTarget] = useState<AdminComment | null>(null)

  // The pills own the whole filter surface: reducer state, debounced searches, label rehydration, merged query input.
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
          {/* Header slot only when no filters are active — body slot below takes over otherwise. */}
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
