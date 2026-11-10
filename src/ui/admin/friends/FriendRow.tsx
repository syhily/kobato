import { ExternalLinkIcon, EyeIcon, EyeOffIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { safeHref } from '@/shared/utils/safe-url'
import { Badge } from '@/ui/components/badge'
import { Skeleton } from '@/ui/components/skeleton'
import { Tooltip } from '@/ui/components/tooltip'
import { useI18n } from '@/ui/lib/I18nProvider'

interface FriendRowProps {
  friend: AdminFriendDto
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}

export const FriendRow = memo(function FriendRow({ friend, disabled, onEdit, onDelete }: FriendRowProps) {
  const { t } = useI18n()
  const homepageHref = safeHref(friend.homepage)

  return (
    <div className="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="relative aspect-3/1 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {/* Plain <img>: `poster` is already an absolute URL, so the `<Image>`
            primitive's `asset.host` localization adds nothing here. */}
        <img
          src={friend.poster}
          alt={friend.website}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
        />
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label={t('admin.friends.row.edit', { website: friend.website })}
          className="truncate text-admin-base font-semibold hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {friend.website}
        </button>
        <p className="mt-0.5 flex items-center gap-2 truncate text-admin-sm text-muted-foreground">
          {homepageHref ? (
            <a
              href={homepageHref}
              target="_blank"
              rel="nofollow noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3" />
              <span className="max-w-xs truncate font-mono">{friend.homepage}</span>
            </a>
          ) : (
            <span className="max-w-xs truncate font-mono">{friend.homepage}</span>
          )}
          {friend.description ? (
            <>
              <span>·</span>
              <FriendDescription description={friend.description} />
            </>
          ) : null}
        </p>
      </div>

      <div className="hidden w-admin-col-narrow shrink-0 justify-end md:flex">
        {friend.visible ? (
          <Badge variant="secondary" className="gap-1">
            <EyeIcon className="size-3" /> {t('admin.friends.row.visible')}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <EyeOffIcon className="size-3" /> {t('admin.friends.row.hidden')}
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title={t('common.action.edit')}
      >
        <SquarePenIcon className="size-4" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-line-muted text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        title={t('common.action.delete')}
        aria-label={t('admin.friends.row.delete', { website: friend.website })}
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
})

interface FriendDescriptionProps {
  description: string
}

function FriendDescription({ description }: FriendDescriptionProps) {
  return (
    <Tooltip placement="top">
      <Tooltip.Trigger
        as="button"
        type="button"
        className="cursor-help truncate text-left text-admin-sm text-muted-foreground hover:text-foreground focus-visible:rounded-sm focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {description}
      </Tooltip.Trigger>
      <Tooltip.Content>{description}</Tooltip.Content>
    </Tooltip>
  )
}

export function FriendsSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={`skeleton-${i}`} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="aspect-3/1 w-40 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-sidebar-item w-admin-col-narrow md:block" />
          <Skeleton className="h-sidebar-item w-admin-col-narrow rounded-xl" />
          <Skeleton className="h-sidebar-item w-admin-col-narrow rounded-xl" />
        </div>
      ))}
    </div>
  )
}
