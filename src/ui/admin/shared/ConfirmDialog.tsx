import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type ReactNode, useRef } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/alert-dialog'
import { cn } from '@/ui/lib/cn'

export interface ConfirmState {
  title: string
  description: string
  actionLabel: string
  destructive: boolean
  /**
   * Optional icon rendered before `actionLabel` on the confirm button.
   * When omitted the icon defaults to `Trash2Icon` for destructive
   * actions (overwhelmingly "delete" in this admin) and `CheckIcon`
   * for the "approve / acknowledge" path. Callers whose destructive
   * action isn't a delete (e.g. 禁言) should pass their own icon.
   */
  actionIcon?: ReactNode
  onConfirm: () => void
}

export interface ConfirmDialogProps {
  /** Pass a state object to open the dialog; pass `null` to close. */
  state: ConfirmState | null
  onClose: () => void
}

/**
 * Generic approve/delete confirmation dialog. Used by every admin view
 * that needs a yes/no prompt. The parent passes `state` only when it
 * wants the dialog open: setting it back to `null` flips `open` to
 * false AND would normally blank every prop derived from `state`
 * (`title`, `description`, `actionLabel`, `destructive`) — which the
 * shadcn AlertDialog renders for the duration of its close animation.
 *
 * Without a snapshot the title would flash to the empty string and the
 * action button would lose its label and red tint mid-animation. Cache
 * the last truthy `state` in a ref so the in-flight close animation
 * keeps rendering the contents the user just saw, and don't blow that
 * snapshot away when the parent reopens with new content (the new
 * truthy `state` overwrites the ref before render reads it).
 */
export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const lastStateRef = useRef<ConfirmState | null>(state)
  if (state !== null) {
    lastStateRef.current = state
  }
  const renderState = state ?? lastStateRef.current
  // Icon defaulting mirrors the rules above. We compute it during the
  // close animation as well (using the snapshot ref) so the icon
  // doesn't flash to a different glyph mid-fadeout.
  const actionIcon =
    renderState?.actionIcon ?? (renderState?.destructive ? <Trash2Icon data-icon /> : <CheckIcon data-icon />)
  return (
    <AlertDialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{renderState?.title}</AlertDialogTitle>
          <AlertDialogDescription>{renderState?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <XIcon data-icon /> 取消
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(renderState?.destructive && 'bg-destructive hover:bg-destructive/90')}
            onClick={() => {
              renderState?.onConfirm()
              onClose()
            }}
          >
            {actionIcon} {renderState?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
