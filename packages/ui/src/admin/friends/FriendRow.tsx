import type { AdminFriendDto } from '@kobato/shared/contracts/friends'

import { safeHref } from '@kobato/shared/utils/safe-url'
import { Badge } from '@kobato/ui/components/badge'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { Tooltip } from '@kobato/ui/components/tooltip'
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'

interface FriendRowProps {
  friend: AdminFriendDto
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}

export const FriendRow = memo(function FriendRow({ friend, disabled, onEdit, onDelete }: FriendRowProps) {
  const homepageHref = safeHref(friend.homepage)

  return (
    <div className="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      {/* Cover */}
      <div className="relative aspect-3/1 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {/* Plain <img> instead of the public `<Image>` primitive: the
            admin list is a low-frequency view and we'd rather not
            depend on the localization context (`asset.host`) for
            something this small — the friend's `poster` is already
            an absolute URL, and the browser handles the lazy
            decoding. */}
        <img
          src={friend.poster}
          alt={friend.website}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`编辑友链 ${friend.website}`}
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

      {/* Visibility */}
      <div className="hidden w-admin-col-narrow shrink-0 justify-end md:flex">
        {friend.visible ? (
          <Badge variant="secondary" className="gap-1">
            <EyeIcon className="size-3" /> 显示
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <EyeOffIcon className="size-3" /> 隐藏
          </Badge>
        )}
      </div>

      {/* Edit */}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="编辑"
      >
        <SquarePenIcon className="size-4" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        title="删除"
        aria-label={`删除友链 ${friend.website}`}
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
