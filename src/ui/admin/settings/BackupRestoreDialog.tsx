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

interface BackupRestoreDialogProps {
  restoreKey: string
  isPending: boolean
  onConfirm: (key: string) => void
  onCancel: () => void
}

export function BackupRestoreDialog({ restoreKey, isPending, onConfirm, onCancel }: BackupRestoreDialogProps) {
  return (
    <AlertDialog open onOpenChange={(open) => {
      if (!open) {
        onCancel()
      }
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认还原</AlertDialogTitle>
          <AlertDialogDescription>
            {`确定要从「${restoreKey.split('/').pop()}」还原数据库吗？当前数据库将被替换，服务将在还原后重启。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => onConfirm(restoreKey)}
          >
            {isPending ? '还原中…' : '确认还原'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
