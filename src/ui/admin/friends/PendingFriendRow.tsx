import { CheckIcon, ExternalLinkIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { safeHref } from '@/shared/utils/safe-url'
import { Badge } from '@/ui/components/badge'
import { useI18n } from '@/ui/lib/I18nProvider'

interface PendingFriendRowProps {
  friend: AdminFriendDto
  disabled: boolean
  approving: boolean
  onApprove: () => void
  onEdit: () => void
  onDelete: () => void
}

// Pending-review row: poster fallback, 待审核 badge, approve action (disabled until a valid poster exists).
export const PendingFriendRow = memo(function PendingFriendRow({
  friend,
  disabled,
  approving,
  onApprove,
  onEdit,
  onDelete,
}: PendingFriendRowProps) {
  const { t } = useI18n()
  const homepageHref = safeHref(friend.homepage)
  const hasPoster = friend.poster.trim() !== ''

  return (
    <div className="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      {/* Cover (or placeholder when the applicant had none) */}
      <div className="relative aspect-3/1 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {hasPoster ? (
          <img
            src={friend.poster}
            alt={friend.website}
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            {t('admin.friends.row.noPoster')}
          </div>
        )}
      </div>

      {/* Content */}
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
              <span className="truncate">{friend.description}</span>
            </>
          ) : null}
        </p>
      </div>

      {/* Status */}
      <div className="hidden w-admin-col-narrow shrink-0 justify-end md:flex">
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          {t('admin.friends.row.pending')}
        </Badge>
      </div>

      {/* Approve */}
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled || approving || !hasPoster}
        aria-label={t('admin.friends.row.approve', { website: friend.website })}
        title={hasPoster ? t('admin.friends.row.approveTitle') : t('admin.friends.row.missingPoster')}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckIcon className="size-4" />
      </button>

      {/* Edit */}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title={t('common.action.edit')}
      >
        <SquarePenIcon className="size-4" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="inline-flex h-sidebar-item w-admin-col-narrow shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        title={t('common.action.delete')}
        aria-label={t('admin.friends.row.delete', { website: friend.website })}
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
})
