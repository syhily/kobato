import {
  CheckIcon,
  ImageIcon,
  LinkIcon,
  MoreHorizontalIcon,
  ReplyIcon,
  SquarePenIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'

import { useMutation, orpcQuery } from '@/client/api/query'
import { useAssetsSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { getImageUrl } from '@/shared/types/images'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { idStr } from '@/shared/utils/tools'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu'
import { PortableTextBody } from '@/ui/pt/render'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'

export interface AdminCommentRowProps {
  comment: AdminComment
  onEdit: () => void
  onReply: () => void
  onEditUser: () => void
  onApproved: () => void
  onDeleted: () => void
  onConfirmApprove: (action: () => void) => void
  onConfirmDelete: (action: () => void) => void
  onFilterByPage: (pageKey: string, pageTitle: string) => void
  onFilterByAuthor: (userId: string, name: string) => void
}

export function AdminCommentRow({
  comment,
  onEdit,
  onReply,
  onEditUser,
  onApproved,
  onDeleted,
  onConfirmApprove,
  onConfirmDelete,
  onFilterByPage,
  onFilterByAuthor,
}: AdminCommentRowProps) {
  const config = useSiteIdentity()
  const { asset, storage } = useAssetsSettings()
  const authorHref = safeHref(comment.link)

  const thumbSrc = comment.pageCover
    ? getImageUrl({
        src: comment.pageCover,
        width: 200,
        height: 125,
        quality: 80,
        assetHost: asset.host,
        urlTemplate: storage.urlTemplate,
      })
    : ''

  const approveMutation = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: () => onApproved(),
  })
  const deleteMutation = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: () => onDeleted(),
  })

  const submitApprove = () => {
    approveMutation.mutate({ rid: idStr(comment.id) })
  }
  const submitDelete = () => {
    deleteMutation.mutate({ rid: idStr(comment.id) })
  }

  const initial = (comment.name || comment.email || '?').slice(0, 1).toUpperCase()

  return (
    <div data-slot="admin-comment-row" className="group flex gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={`/images/avatar/${comment.userId}.png`} alt={comment.name} />
        <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{initial}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        {/* Header: name + badges + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            {comment.isPending ? (
              <Badge variant="destructive">待审核</Badge>
            ) : (
              <Badge variant="secondary">已审核</Badge>
            )}
          </div>

          {/* Inline action buttons */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {comment.isPending && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={approveMutation.isPending}
                onClick={() => onConfirmApprove(submitApprove)}
                className="h-7 gap-1 px-2 text-xs"
              >
                <CheckIcon className="size-3" /> 审核
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onReply} className="h-7 gap-1 px-2 text-xs">
              <ReplyIcon className="size-3" /> 回复
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="ghost" size="icon" aria-label="更多操作" className="size-7">
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onEdit}>
                  <SquarePenIcon /> 编辑评论
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEditUser}>
                  <UserIcon /> 编辑用户
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => onConfirmDelete(submitDelete)}
                >
                  <Trash2Icon /> 删除评论
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

        {/* Body */}
        <div className="comment-content prose-blog prose prose-sm mt-2 max-w-none leading-[1.85] wrap-break-word whitespace-normal">
          <PortableTextBody body={comment.body} />
        </div>
      </div>

      {/* Cover thumbnail */}
      {thumbSrc ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 overflow-hidden rounded-xl bg-muted md:block">
          <img src={thumbSrc} alt="" className="size-full object-cover" loading="lazy" />
        </div>
      ) : comment.pageTitle ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground md:flex">
          <ImageIcon className="size-5" />
        </div>
      ) : null}
    </div>
  )
}
