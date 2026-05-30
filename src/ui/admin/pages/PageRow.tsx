import { FilePenIcon, ImageIcon, MessageSquareIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPageDto } from '@/shared/types/pages'

import { cn } from '@/ui/lib/cn'

interface PageRowProps {
  page: AdminPageDto
}

function formatPageDate(page: AdminPageDto): string {
  const date = page.published ? new Date(page.publishedAt) : new Date(page.updatedAt)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPageDateLabel(page: AdminPageDto): string {
  return page.published ? '发布于' : '更新于'
}

function PageStatusText({ page }: { page: AdminPageDto }) {
  if (page.deletedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        已删除
      </span>
    )
  }
  if (!page.published) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-pink-500">
        <span className="size-1.5 rounded-full bg-pink-500" />
        草稿
      </span>
    )
  }
  if (page.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-amber-600">
        <span className="size-1.5 rounded-full bg-amber-600" />
        仅草稿
      </span>
    )
  }
  return <span className="text-(--text-admin-sm) text-muted-foreground">已发布</span>
}

export function PageRow({ page }: PageRowProps) {
  const isDeleted = page.deletedAt !== null

  const dateText = `${formatPageDateLabel(page)} ${formatPageDate(page)}`

  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50',
        isDeleted && 'opacity-60',
      )}
      data-deleted={isDeleted || undefined}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-(--spacing-admin-thumb) flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {page.cover ? (
          <img src={page.cover} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        <Link
          to={`/editor/page/${page.id}`}
          className="truncate font-semibold text-(--text-admin-base) hover:underline"
        >
          {page.title}
        </Link>

        {/* Meta */}
        <p className="mt-0.5 truncate text-(--text-admin-sm) text-muted-foreground">
          <span className="font-mono">/{page.slug}</span>
          {' · '}
          {page.authorName || '—'}
          {' · '}
          {dateText}
        </p>

        {/* Status */}
        <div className="mt-1">
          <PageStatusText page={page} />
        </div>
      </div>

      {/* Comment count */}
      <Link
        to={`/admin/comments?pageKey=${encodeURIComponent(page.commentPublicId)}`}
        className="hidden w-(--spacing-admin-col-narrow) shrink-0 items-center gap-1 text-(--text-admin-sm) text-muted-foreground transition-colors hover:text-foreground md:flex"
      >
        <MessageSquareIcon className="size-4" />
        <span className="tabular-nums">{page.commentCount}</span>
      </Link>

      {/* CTA button */}
      <Link
        to={`/editor/page/${page.id}`}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title="编辑"
      >
        <FilePenIcon className="size-4" />
      </Link>
    </div>
  )
}
