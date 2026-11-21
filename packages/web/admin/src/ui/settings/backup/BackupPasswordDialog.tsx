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
import { Input } from '@kobato/ui/components/input'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useState } from 'react'

interface BackupPasswordDialogProps {
  title: string
  description: string
  pending: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function BackupPasswordDialog({ title, description, pending, onSubmit, onCancel }: BackupPasswordDialogProps) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onCancel()
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (password !== '' && !pending) {
              onSubmit(password)
            }
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder={t('admin.settings.backup.password.placeholder')}
            value={password}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
          />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={pending}>{t('common.action.cancel')}</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={pending || password === ''}>
              {pending ? t('admin.settings.backup.password.verifying') : t('common.action.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
