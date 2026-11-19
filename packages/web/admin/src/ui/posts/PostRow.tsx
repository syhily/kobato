import type { AdminPostDto } from '@kobato/contracts/posts.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'

import { cn } from '@kobato/ui/lib/cn.ts'
import { type I18nValue, useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatDate } from '@kobato/utils/format.ts'
import { useSiteIdentity } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { Image } from '@kobato/web-public/ui/widgets/Image.tsx'
import { ImageIcon, MessageSquareIcon, PinIcon, SquarePenIcon } from 'lucide-react'
import { Link } from 'react-router'

interface PostRowProps {
  post: AdminPostDto
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
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        {t('admin.content.status.deleted')}
      </span>
    )
  }
  if (!post.published) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-draft-fg">
        <span className="size-1.5 rounded-full bg-status-draft-fg" />
        {t('admin.content.status.draft')}
      </span>
    )
  }
  if (post.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        {t('admin.content.status.draftOnly')}
      </span>
    )
  }
  if (!post.visible) {
    return (
      <span className="inline-flex items-center gap-1.5 text-admin-sm font-medium text-status-warn-fg">
        <span className="size-1.5 rounded-full bg-status-warn-fg" />
        {t('admin.content.status.unlisted')}
      </span>
    )
  }
  return <span className="text-admin-sm text-muted-foreground">{t('admin.content.status.published')}</span>
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
      <div className="relative aspect-[16/10] w-admin-thumb flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {post.cover ? (
          <Image src={post.cover} alt="" width={200} height={125} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Link to={`/editor/post/${post.id}`} className="truncate text-admin-base font-semibold hover:underline">
            {post.title}
          </Link>
          {post.pinnedAt !== null && <PinIcon className="size-3.5 shrink-0 text-status-warn-fg" />}
        </div>

        <p className="mt-0.5 truncate text-admin-sm text-muted-foreground">
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

        <div className="mt-1">
          <PostStatusText post={post} />
        </div>
      </div>

      <Link
        to={`/admin/comments?pageKey=${encodeURIComponent(post.commentPublicId)}`}
        className="hidden w-admin-col-narrow shrink-0 items-center gap-1 text-admin-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
      >
        <MessageSquareIcon className="size-4" />
        <span className="tabular-nums">{post.commentCount}</span>
      </Link>

      <Link
        to={`/editor/post/${post.id}`}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title={t('common.action.edit')}
      >
        <SquarePenIcon className="size-4" />
      </Link>
    </div>
  )
}
