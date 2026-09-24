import { useState } from 'react'

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
import { Input } from '@/ui/components/input'

interface BackupPasswordDialogProps {
  title: string
  description: string
  pending: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}

/** Password prompt for encrypted backups — used both when an upload turns
 *  out to be encrypted and when a stored backup needs its password. */
export function BackupPasswordDialog({ title, description, pending, onSubmit, onCancel }: BackupPasswordDialogProps) {
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
            placeholder="备份密码"
            value={password}
            disabled={pending}
            onChange={(event) => setPassword(event.target.value)}
          />
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={pending || password === ''}>
              {pending ? '验证中…' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
