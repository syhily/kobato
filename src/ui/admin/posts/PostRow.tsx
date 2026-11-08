import { ImageIcon, MessageSquareIcon, PinIcon, SquarePenIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPostDto } from '@/shared/contracts/posts'
import type { AppLocale } from '@/shared/i18n/locales'

import { formatDate } from '@/shared/i18n/format'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { cn } from '@/ui/lib/cn'
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'
import { Image } from '@/ui/public/widgets/Image'

interface PostRowProps {
  post: AdminPostDto
  /** Receives the category ID + display name — the posts-list filter pill
   *  keys by id and shows the name. */
  onFilterCategory?: (categoryId: string, categoryName: string) => void
}

function formatPostDate(post: AdminPostDto, options: { locale: AppLocale; timeZone: string }): string {
  const date = post.published ? new Date(post.firstPublishedAt ?? post.publishedAt) : new Date(post.updatedAt)
  return formatDate(date, {
    locale: options.locale,
    timeZone: options.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPostDateLabel(post: AdminPostDto, t: I18nValue['t']): string {
  return post.published ? t('admin.content.publishedAt') : t('admin.content.updatedAt')
}

function PostStatusText({ post }: { post: AdminPostDto }) {
  const { t } = useI18n()
  if (post.deletedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        {t('admin.content.status.deleted')}
      </span>
    )
  }
  if (!post.published) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-status-draft-fg">
        <span className="size-1.5 rounded-full bg-status-draft-fg" />
        {t('admin.content.status.draft')}
      </span>
    )
  }
  if (post.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        {t('admin.content.status.draftOnly')}
      </span>
    )
  }
  if (!post.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        {t('admin.content.status.unlisted')}
      </span>
    )
  }
  return <span className="text-(--text-admin-sm) text-muted-foreground">{t('admin.content.status.published')}</span>
}

export function PostRow({ post, onFilterCategory }: PostRowProps) {
  const { locale, t, tRich } = useI18n()
  const { timeZone } = useSiteIdentity()
  const isDeleted = post.deletedAt !== null

  const dateText = `${formatPostDateLabel(post, t)} ${formatPostDate(post, { locale, timeZone })}`

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
          {tRich('admin.posts.row.authorIn', {
            author: post.authorName || '—',
            categoryName: post.category || t('admin.posts.row.noCategory'),
            // oxlint-disable-next-line react/no-unstable-nested-components -- tRich render-prop, not a component definition
            category: (chunks) =>
              post.categoryId !== null && onFilterCategory ? (
                <button
                  type="button"
                  onClick={() => onFilterCategory(post.categoryId!, post.category || post.categoryId!)}
                  className="hover:text-foreground hover:underline"
                >
                  {chunks}
                </button>
              ) : (
                <>{chunks}</>
              ),
          })}
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
        title={t('common.action.edit')}
      >
        <SquarePenIcon className="size-4" />
      </Link>
    </div>
  )
}
