import type { AdminPostDto } from '@/shared/contracts/posts'

interface StatusBadgeProps {
  post: AdminPostDto
}

export function StatusBadge({ post }: StatusBadgeProps) {
  if (post.deletedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        已删除
      </span>
    )
  }

  if (!post.published) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-draft-fg">
        <span className="size-1.5 rounded-full bg-status-draft-fg" />
        草稿
      </span>
    )
  }

  if (post.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        仅草稿
      </span>
    )
  }

  if (!post.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        隐藏
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-success-fg">
      <span className="size-1.5 rounded-full bg-status-success-fg" />
      已发布
    </span>
  )
}
