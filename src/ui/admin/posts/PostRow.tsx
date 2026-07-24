import { ImageIcon, MessageSquareIcon, PinIcon, SquarePenIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPostDto } from '@/shared/contracts/posts'

import { cn } from '@/ui/lib/cn'
import { Image } from '@/ui/public/widgets/Image'

interface PostRowProps {
  post: AdminPostDto
  /** Receives the category ID string — the posts-list filter keys by id. */
  onFilterCategory?: (categoryId: string) => void
}

function formatPostDate(post: AdminPostDto): string {
  const date = post.published ? new Date(post.firstPublishedAt ?? post.publishedAt) : new Date(post.updatedAt)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPostDateLabel(post: AdminPostDto): string {
  return post.published ? '发布于' : '更新于'
}

function PostStatusText({ post }: { post: AdminPostDto }) {
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
  return <span className="text-(--text-admin-sm) text-muted-foreground">已发布</span>
}

export function PostRow({ post, onFilterCategory }: PostRowProps) {
  const isDeleted = post.deletedAt !== null

  const dateText = `${formatPostDateLabel(post)} ${formatPostDate(post)}`

  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50',
        isDeleted && 'opacity-60',
      )}
      data-deleted={isDeleted || undefined}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-(--spacing-admin-thumb) flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {post.cover ? (
          <Image src={post.cover} alt="" width={200} height={125} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        <div className="flex items-center gap-1.5">
          <Link
            to={`/editor/post/${post.id}`}
            className="truncate font-semibold text-(--text-admin-base) hover:underline"
          >
            {post.title}
          </Link>
          {post.pinnedAt !== null && <PinIcon className="size-3.5 shrink-0 text-status-warn-fg" />}
        </div>

        {/* Meta */}
        <p className="mt-0.5 truncate text-(--text-admin-sm) text-muted-foreground">
          {post.authorName || '—'} 在{' '}
          {post.categoryId !== null && onFilterCategory ? (
            <button
              type="button"
              onClick={() => onFilterCategory(post.categoryId!)}
              className="hover:text-foreground hover:underline"
            >
              {post.category}
            </button>
          ) : (
            post.category || '无分类'
          )}
          {' · '}
          {dateText}
        </p>

        {/* Status */}
        <div className="mt-1">
          <PostStatusText post={post} />
        </div>
      </div>

      {/* Comment count */}
      <Link
        to={`/admin/comments?pageKey=${encodeURIComponent(post.commentPublicId)}`}
        className="hidden w-(--spacing-admin-col-narrow) shrink-0 items-center gap-1 text-(--text-admin-sm) text-muted-foreground transition-colors hover:text-foreground md:flex"
      >
        <MessageSquareIcon className="size-4" />
        <span className="tabular-nums">{post.commentCount}</span>
      </Link>

      {/* CTA button */}
      <Link
        to={`/editor/post/${post.id}`}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title="编辑"
      >
        <SquarePenIcon className="size-4" />
      </Link>
    </div>
  )
}
