import { CheckIcon, ExternalLinkIcon, SquarePenIcon, Trash2Icon } from 'lucide-react'
import { memo } from 'react'

import type { AdminFriendDto } from '@/shared/contracts/friends'

import { safeHref } from '@/shared/utils/safe-url'
import { Badge } from '@/ui/components/badge'

interface PendingFriendRowProps {
  friend: AdminFriendDto
  disabled: boolean
  approving: boolean
  onApprove: () => void
  onEdit: () => void
  onDelete: () => void
}

// Row in the pending-review bucket: poster fallback for coverless
// applicants, a 待审核 badge, and an approve action. Approve reuses the
// admin upsert path, which requires a valid poster — it stays disabled
// until the admin fills the cover via the edit dialog.
export const PendingFriendRow = memo(function PendingFriendRow({
  friend,
  disabled,
  approving,
  onApprove,
  onEdit,
  onDelete,
}: PendingFriendRowProps) {
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
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">无封面</div>
        )}
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
              <span className="truncate">{friend.description}</span>
            </>
          ) : null}
        </p>
      </div>

      {/* Status */}
      <div className="hidden w-admin-col-narrow shrink-0 justify-end md:flex">
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          待审核
        </Badge>
      </div>

      {/* Approve */}
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled || approving || !hasPoster}
        aria-label={`通过友链 ${friend.website}`}
        title={hasPoster ? '通过' : '缺少封面图，请先编辑补充'}
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
