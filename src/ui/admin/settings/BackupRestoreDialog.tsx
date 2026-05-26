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

type RestorePhase = 'confirm' | 'waiting'

interface BackupRestoreDialogProps {
  restoreKey: string
  isPending: boolean
  phase: RestorePhase
  onConfirm: (key: string) => void
  onCancel: () => void
}

export function BackupRestoreDialog({ restoreKey, isPending, phase, onConfirm, onCancel }: BackupRestoreDialogProps) {
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
          <AlertDialogTitle>{phase === 'confirm' ? '确认还原' : '等待服务重启'}</AlertDialogTitle>
          <AlertDialogDescription>
            {phase === 'confirm'
              ? `确定要从「${restoreKey.split('/').pop()}」还原数据库吗？当前数据库将被替换，服务将在还原后重启。`
              : '备份已接收，服务正在重启。此过程可能需要数十秒，请勿关闭页面。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {phase === 'confirm' ? (
            <>
              <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isPending}
                onClick={() => onConfirm(restoreKey)}
              >
                {isPending ? '还原中…' : '确认还原'}
              </AlertDialogAction>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" size={16} />
              正在等待服务恢复…
            </div>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
