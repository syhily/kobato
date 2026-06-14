import { useMutation } from '@tanstack/react-query'
import { CheckIcon, ImageIcon, LinkIcon, ReplyIcon, SquarePenIcon, Trash2Icon, UserIcon, XIcon } from 'lucide-react'

import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { bodyToPlainText } from '@/shared/pt/utils'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { idStr } from '@/shared/utils/tools'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { PortableTextBody } from '@/ui/pt/render'
import { Image } from '@/ui/public/widgets/Image'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'
const REPLY_SNIPPET_MAX = 60

export interface AdminCommentRowProps {
  comment: AdminComment
  parentLookup: Map<string, AdminComment>
  onEdit: () => void
  onReply: () => void
  onEditUser: () => void
  onApproved: () => void
  onDeleted: () => void
  onDeleteRequestResolved: (approved: boolean) => void
  onConfirmApprove: (action: () => void) => void
  onConfirmDelete: (action: () => void) => void
  onConfirmApproveDeletion: (action: () => void) => void
  onConfirmRejectDeletion: (action: () => void) => void
  onFilterByPage: (pageKey: string, pageTitle: string) => void
  onFilterByAuthor: (userId: string, name: string) => void
}

export function AdminCommentRow({
  comment,
  parentLookup,
  onEdit,
  onReply,
  onEditUser,
  onApproved,
  onDeleted,
  onDeleteRequestResolved,
  onConfirmApprove,
  onConfirmDelete,
  onConfirmApproveDeletion,
  onConfirmRejectDeletion,
  onFilterByPage,
  onFilterByAuthor,
}: AdminCommentRowProps) {
  const config = useSiteIdentity()
  const authorHref = safeHref(comment.link)

  const approveMutation = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: () => onApproved(),
  })
  const deleteMutation = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: () => onDeleted(),
  })
  const approveDeletionMutation = useMutation({
    ...orpcQuery.admin.comments.approveCommentDeletion.mutationOptions(),
    onSuccess: (_, variables) => onDeleteRequestResolved(variables.approve),
  })

  const submitApprove = () => {
    approveMutation.mutate({ rid: idStr(comment.id) })
  }
  const submitDelete = () => {
    deleteMutation.mutate({ rid: idStr(comment.id) })
  }
  const submitApproveDeletion = () => {
    approveDeletionMutation.mutate({ commentId: idStr(comment.id), approve: true })
  }
  const submitRejectDeletion = () => {
    approveDeletionMutation.mutate({ commentId: idStr(comment.id), approve: false })
  }

  const initial = (comment.name || comment.email || '?').slice(0, 1).toUpperCase()

  const parent = resolveParent(comment, parentLookup)

  return (
    <div
      data-slot="admin-comment-row"
      className="group grid grid-cols-1 gap-4 px-4 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_var(--spacing-admin-thumb)]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={`/images/avatar/${comment.userId}.png`} alt={comment.name} />
          <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{initial}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          {/* Header: name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onFilterByAuthor(idStr(comment.userId), comment.name)}
              title={`仅查看 ${comment.name} 的评论`}
              className="cursor-pointer truncate text-left font-semibold hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {comment.name}
            </button>
            {authorHref && (
              <a
                href={authorHref}
                target="_blank"
                rel="nofollow noreferrer"
                aria-label={`访问 ${comment.name} 的网站`}
                className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
              >
                <LinkIcon />
              </a>
            )}
            {comment.badgeName && (
              <Badge
                style={{
                  backgroundColor: comment.badgeColor || '#008c95',
                  color: comment.badgeTextColor || '#ffffff',
                }}
                className="border-transparent"
              >
                {comment.badgeName}
              </Badge>
            )}
            {comment.deleteRequestedAt ? (
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                申请删除
              </Badge>
            ) : comment.isPending ? (
              <Badge variant="secondary">待审核</Badge>
            ) : (
              <Badge variant="secondary">已审核</Badge>
            )}
          </div>

          {/* Meta: date + page */}
          <p className="mt-0.5 truncate text-(--text-admin-sm) text-muted-foreground">
            {comment.createAt ? formatLocalDate(comment.createAt, ADMIN_DATE_FORMAT, config) : ''}
            {comment.pageTitle && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => onFilterByPage(comment.pagePublicId ?? '', comment.pageTitle ?? '')}
                  title={`仅查看《${comment.pageTitle}》的评论`}
                  className="hover:text-foreground"
                >
                  {comment.pageTitle}
                </button>
              </>
            )}
          </p>

          {/* "Replied to" hint — only when the parent is in the loaded list */}
          {parent && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <ReplyIcon className="mr-1 inline size-3 align-[-2px]" />
              回复 <span className="underline-offset-2 hover:underline">{parent.name}</span>：
              <span className="text-foreground/70"> “{snippet(parent.body, REPLY_SNIPPET_MAX)}”</span>
            </p>
          )}

          {/* Body */}
          <div className="comment-content prose-blog prose prose-sm mt-2 max-w-none leading-[1.85] wrap-break-word whitespace-normal">
            <PortableTextBody body={comment.body} />
          </div>

          {/* Action row — flat, no overflow menu. Text label hides on narrow screens. */}
          <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
            {comment.isPending && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={approveMutation.isPending}
                onClick={() => onConfirmApprove(submitApprove)}
                aria-label="通过评论"
              >
                <CheckIcon data-icon="sm" />
                <span className="hidden sm:inline">通过</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReply}
              aria-label="回复评论"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ReplyIcon data-icon="sm" />
              <span className="hidden sm:inline">回复</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onEdit}
              aria-label="编辑评论"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <SquarePenIcon data-icon="sm" />
              <span className="hidden sm:inline">编辑评论</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onEditUser}
              aria-label="编辑用户"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserIcon data-icon="sm" />
              <span className="hidden sm:inline">编辑用户</span>
            </Button>
            {comment.pagePermalink && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                render={
                  <a
                    href={comment.pagePermalink}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="在新标签页打开对应文章"
                  />
                }
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LinkIcon data-icon="sm" />
                <span className="hidden sm:inline">查看文章</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={deleteMutation.isPending}
              onClick={() => onConfirmDelete(submitDelete)}
              aria-label="删除评论"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon data-icon="sm" />
              <span className="hidden sm:inline">删除评论</span>
            </Button>
            {comment.deleteRequestedAt && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={approveDeletionMutation.isPending}
                  onClick={() => onConfirmRejectDeletion(submitRejectDeletion)}
                  aria-label="拒绝删除申请"
                  className="h-7 px-2.5 text-xs"
                >
                  <XIcon data-icon="sm" />
                  <span className="hidden sm:inline">拒绝删除</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={approveDeletionMutation.isPending}
                  onClick={() => onConfirmApproveDeletion(submitApproveDeletion)}
                  aria-label="同意删除申请"
                  className="h-7 px-2.5 text-xs"
                >
                  <CheckIcon data-icon="sm" />
                  <span className="hidden sm:inline">同意删除</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cover thumbnail */}
      {comment.pageCover ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 self-start overflow-hidden rounded-xl bg-muted md:block">
          <Image
            src={comment.pageCover}
            alt=""
            width={200}
            height={125}
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
      ) : comment.pageTitle ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 items-center justify-center self-start rounded-xl bg-muted text-muted-foreground md:flex">
          <ImageIcon className="size-5" />
        </div>
      ) : null}
    </div>
  )
}

function resolveParent(comment: AdminComment, parentLookup: Map<string, AdminComment>): AdminComment | null {
  if (comment.rootId) {
    const direct = parentLookup.get(comment.rootId)
    if (direct) {
      return direct
    }
  }
  if (comment.rid > 0) {
    for (const candidate of parentLookup.values()) {
      if (candidate.rid === comment.rid && candidate.id !== comment.id) {
        return candidate
      }
    }
  }
  return null
}

// Truncated single-line preview of a comment body for the "Replied to"
// hint. Reuses the shared plain-text projection so a paragraph break
// or nested code block collapses into whitespace, not into a literal
// newline inside the inline hint.
function snippet(body: AdminComment['body'], max: number): string {
  const text = bodyToPlainText(body).replace(/\s+/g, ' ').trim()
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}…`
}
