import { ImageIcon, MessageSquareIcon, SquarePenIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminPageDto } from '@/shared/contracts/pages'
import type { AppLocale } from '@/shared/i18n/locales'

import { formatDate } from '@/shared/i18n/format'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { cn } from '@/ui/lib/cn'
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'
import { Image } from '@/ui/public/widgets/Image'

interface PageRowProps {
  page: AdminPageDto
}

function formatPageDate(page: AdminPageDto, options: { locale: AppLocale; timeZone: string }): string {
  const date = page.published ? new Date(page.publishedAt) : new Date(page.updatedAt)
  return formatDate(date, {
    locale: options.locale,
    timeZone: options.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPageDateLabel(page: AdminPageDto, t: I18nValue['t']): string {
  return page.published ? t('admin.content.publishedAt') : t('admin.content.updatedAt')
}

function PageStatusText({ page }: { page: AdminPageDto }) {
  const { t } = useI18n()
  if (page.deletedAt !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        {t('admin.content.status.deleted')}
      </span>
    )
  }
  if (!page.published) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-pink-500">
        <span className="size-1.5 rounded-full bg-pink-500" />
        {t('admin.content.status.draft')}
      </span>
    )
  }
  if (page.publishedRevisionId === null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-(--text-admin-sm) text-amber-600">
        <span className="size-1.5 rounded-full bg-amber-600" />
        {t('admin.content.status.draftOnly')}
      </span>
    )
  }
  return <span className="text-(--text-admin-sm) text-muted-foreground">{t('admin.content.status.published')}</span>
}

export function PageRow({ page }: PageRowProps) {
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const isDeleted = page.deletedAt !== null

  const dateText = `${formatPageDateLabel(page, t)} ${formatPageDate(page, { locale, timeZone })}`

  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50',
        isDeleted && 'opacity-60',
      )}
      data-deleted={isDeleted || undefined}
    >
      <div className="relative aspect-[16/10] w-(--spacing-admin-thumb) flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {page.cover ? (
          <Image src={page.cover} alt="" width={200} height={125} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link
          to={`/editor/page/${page.id}`}
          className="truncate font-semibold text-(--text-admin-base) hover:underline"
        >
          {page.title}
        </Link>

        <p className="mt-0.5 truncate text-(--text-admin-sm) text-muted-foreground">
          <span className="font-mono">/{page.slug}</span>
          {' · '}
          {page.authorName || '—'}
          {' · '}
          {dateText}
        </p>

        <div className="mt-1">
          <PageStatusText page={page} />
        </div>
      </div>

      <Link
        to={`/admin/comments?pageKey=${encodeURIComponent(page.commentPublicId)}`}
        className="hidden w-(--spacing-admin-col-narrow) shrink-0 items-center gap-1 text-(--text-admin-sm) text-muted-foreground transition-colors hover:text-foreground md:flex"
      >
        <MessageSquareIcon className="size-4" />
        <span className="tabular-nums">{page.commentCount}</span>
      </Link>

      <Link
        to={`/editor/page/${page.id}`}
        className="inline-flex h-(--spacing-sidebar-item) w-(--spacing-admin-col-narrow) shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        title={t('common.action.edit')}
      >
        <SquarePenIcon className="size-4" />
      </Link>
    </div>
  )
}
