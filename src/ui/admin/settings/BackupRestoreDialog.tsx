import { Loader2Icon } from 'lucide-react'

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
import { useI18n } from '@/ui/lib/I18nProvider'

type RestorePhase = 'confirm' | 'waiting'

interface BackupRestoreDialogProps {
  restoreKey: string
  isPending: boolean
  phase: RestorePhase
  onConfirm: (key: string) => void
  onCancel: () => void
}

export function BackupRestoreDialog({ restoreKey, isPending, phase, onConfirm, onCancel }: BackupRestoreDialogProps) {
  const { t } = useI18n()
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && phase !== 'waiting') {
          onCancel()
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {phase === 'confirm'
              ? t('admin.settings.backup.restore.confirmTitle')
              : t('admin.settings.backup.restore.waitingTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {phase === 'confirm'
              ? t('admin.settings.backup.restore.confirmBody', { name: restoreKey.split('/').pop() ?? '' })
              : t('admin.settings.backup.restore.waitingBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {phase === 'confirm' ? (
            <>
              <AlertDialogCancel disabled={isPending}>{t('common.action.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isPending}
                onClick={() => onConfirm(restoreKey)}
              >
                {isPending ? t('admin.settings.backup.restore.restoring') : t('admin.settings.backup.restore.confirm')}
              </AlertDialogAction>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" size={16} />
              {t('admin.settings.backup.restore.waiting')}
            </div>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
