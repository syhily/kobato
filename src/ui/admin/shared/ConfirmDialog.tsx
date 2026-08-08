import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'

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
  /** Icon on the confirm button; defaults to `Trash2Icon` / `CheckIcon`. */
  actionIcon?: ReactNode
  onConfirm: () => void
}

export interface ConfirmDialogProps {
  /** Pass a state object to open the dialog; pass `null` to close. */
  state: ConfirmState | null
  onClose: () => void
}

/** Generic approve/delete dialog. The last truthy `state` is cached through
 *  the close animation so title/buttons don't blank mid-animation. */
export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const [lastState, setLastState] = useState<ConfirmState | null>(state)
  if (state !== null && state !== lastState) {
    setLastState(state)
  }
  const renderState = state ?? lastState
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
