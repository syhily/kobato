import type { AdminPostDto } from '@/shared/types/posts'

interface StatusBadgeProps {
  post: AdminPostDto
}

export function StatusBadge({ post }: StatusBadgeProps) {
  if (post.deletedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        已删除
      </span>
    )
  }

  if (!post.published) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-pink-500">
        <span className="size-1.5 rounded-full bg-pink-500" />
        草稿
      </span>
    )
  }

  if (post.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-amber-600">
        <span className="size-1.5 rounded-full bg-amber-600" />
        仅草稿
      </span>
    )
  }

  if (!post.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-amber-600">
        <span className="size-1.5 rounded-full bg-amber-600" />
        隐藏
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-green-600">
      <span className="size-1.5 rounded-full bg-green-600" />
      已发布
    </span>
  )
}
