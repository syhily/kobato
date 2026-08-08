import { SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { idStr } from '@/shared/utils/tools'
import { AdminCommentRow } from '@/ui/admin/comments/AdminCommentRow'
import { EditCommentDialog } from '@/ui/admin/comments/EditCommentDialog'
import { EditUserDialog } from '@/ui/admin/comments/EditUserDialog'
import {
  COMMENT_FILTER_FIELDS,
  type CommentFilterFieldKey,
  type CommentsFilterQuery,
} from '@/ui/admin/comments/filter-fields'
import { ReplyCommentDialog } from '@/ui/admin/comments/ReplyCommentDialog'
import { useCommentsController } from '@/ui/admin/comments/useCommentsController'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'
import { FilterPillBar } from '@/ui/admin/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'
import { skeletonKeys } from '@/ui/lib/skeleton-keys'

export interface CommentsViewProps {
  currentUserName: string
  currentUserEmail: string
  initialFilters: ActiveFilter<CommentFilterFieldKey>[]
}

export function CommentsView({ currentUserName, currentUserEmail, initialFilters }: CommentsViewProps) {
  // Dialog targets stay view-owned so the row never sees the dialogs.
  const [editTarget, setEditTarget] = useState<AdminComment | null>(null)
  const [replyTarget, setReplyTarget] = useState<AdminComment | null>(null)
  const [editUserTarget, setEditUserTarget] = useState<AdminComment | null>(null)

  // The pills own the whole filter surface: reducer state, debounced searches, label rehydration, merged query input.
  const pills = useFilterPills({ fields: COMMENT_FILTER_FIELDS, initial: initialFilters })

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
        <AdminListPage.Header title="评论管理" description="审核、回复、编辑站点评论。">
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
                  <EmptyTitle>暂无评论</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              comments.map((comment) => (
                <AdminCommentRow
                  key={idStr(comment.id)}
                  comment={comment}
                  parentLookup={parentLookup}
                  actions={actions}
                />
              ))
            )}
          </div>

          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {(isFetchingNextPage || (!hasMore && comments.length > 0)) && (
            <AdminInfiniteListFooter
              noun="评论"
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
            updateCommentBody(idStr(editTarget.id), c.body)
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
        authorName={currentUserName || '管理员'}
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
