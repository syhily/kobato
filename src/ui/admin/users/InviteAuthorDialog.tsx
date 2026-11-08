import { useMutation } from '@tanstack/react-query'
import { SendIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'

interface Props {
  open: boolean
  onClose: () => void
  onInvited: () => void
}

export function InviteAuthorDialog({ open, onClose, onInvited }: Props) {
  const { t } = useI18n()
  const invite = useMutation({
    ...orpcQuery.admin.users.inviteAuthor.mutationOptions(),
    onSuccess: () => {
      setName('')
      setEmail('')
      onInvited()
    },
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const submitting = invite.isPending
  const error = invite.error?.message

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.users.invite.title')}</DialogTitle>
          <DialogDescription>{t('admin.users.invite.description')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate({ name, email })
          }}
          className="grid gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">{t('admin.users.invite.name')}</Label>
            <Input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.users.invite.namePlaceholder')}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">{t('admin.users.invite.email')}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('admin.users.invite.emailPlaceholder')}
              required
            />
          </div>
          {!!error && <div className="text-sm text-destructive">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              <SendIcon data-icon /> {submitting ? t('admin.users.invite.sending') : t('admin.users.invite.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
