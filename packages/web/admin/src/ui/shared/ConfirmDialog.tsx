import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kobato/ui/components/alert-dialog'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export interface ConfirmState {
  title: string
  description: string
  actionLabel: string
  destructive: boolean
  actionIcon?: ReactNode
  onConfirm: () => void
}

export interface ConfirmDialogProps {
  state: ConfirmState | null
  onClose: () => void
}

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const { t } = useI18n()
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
            <XIcon data-icon /> {t('common.action.cancel')}
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
