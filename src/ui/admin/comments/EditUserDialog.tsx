import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'

import { orpc } from '@/client/api/client'
import { onMutationError } from '@/client/lib/toast-api-error'
import { idStr } from '@/shared/utils/tools'
import { buildUserUpdatePayload } from '@/ui/admin/users/user-update-payload'
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
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

const DEFAULT_BADGE_TEXT_COLOR = '#ffffff'

export interface EditUserDialogProps {
  comment: AdminComment | null
  onClose: () => void
  onSaved: () => void
}

export function EditUserDialog({ comment, onClose, onSaved }: EditUserDialogProps) {
  const { t } = useI18n()
  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | null>) => {
      const { id, ...body } = payload
      return orpc.admin.users.update({ id: id!, ...body })
    },
    onSuccess: () => onSaved(),
    onError: onMutationError('admin.toast.userSaveFailed', t),
  })
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  const [name, setName] = useState(comment?.name ?? '')
  const [email, setEmail] = useState(comment?.email ?? '')
  const [link, setLink] = useState(comment?.link ?? '')
  const [badgeName, setBadgeName] = useState(comment?.badgeName ?? '')
  const [badgeColor, setBadgeColor] = useState(comment?.badgeColor ?? '#007a82')
  const [useTextOverride, setUseTextOverride] = useState(comment?.badgeTextColor != null)
  const [badgeTextColor, setBadgeTextColor] = useState(comment?.badgeTextColor ?? DEFAULT_BADGE_TEXT_COLOR)
  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    if (comment) {
      setName(comment.name)
      setEmail(comment.email)
      setLink(comment.link ?? '')
      setBadgeName(comment.badgeName ?? '')
      setBadgeColor(comment.badgeColor ?? '#007a82')
      setUseTextOverride(comment.badgeTextColor !== null && comment.badgeTextColor !== undefined)
      setBadgeTextColor(comment.badgeTextColor ?? DEFAULT_BADGE_TEXT_COLOR)
    }
  }

  const open = comment !== null
  const submitting = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.comments.editUser.title')}</DialogTitle>
          <DialogDescription>{t('admin.comments.editUser.description')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            const payload = buildUserUpdatePayload({
              name,
              email,
              link,
              badgeName,
              badgeColor,
              useTextOverride,
              badgeTextColor,
            })
            mutation.mutate({ ...payload, id: idStr(comment.userId) })
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-name">{t('admin.users.edit.name')}</Label>
            <Input id="edit-user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-email">{t('admin.users.edit.email')}</Label>
            <Input
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="edit-user-link">{t('admin.users.edit.link')}</Label>
            <Input
              id="edit-user-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-badge-name">{t('admin.users.edit.badgeName')}</Label>
            <Input
              id="edit-user-badge-name"
              type="text"
              value={badgeName}
              onChange={(e) => setBadgeName(e.target.value)}
              placeholder={t('admin.comments.editUser.badgePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-badge-color">{t('admin.users.edit.badgeColor')}</Label>
            <Input
              id="edit-user-badge-color"
              type="color"
              value={badgeColor}
              onChange={(e) => setBadgeColor(e.target.value)}
              className="h-9 p-1"
            />
          </div>
          {/* Optional badge text-color override — same checkbox-gated picker + preview chip UX as `UserDetailView.tsx`. */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-user-badge-text-toggle"
                checked={useTextOverride}
                onCheckedChange={(next) => setUseTextOverride(next === true)}
              />
              <Label htmlFor="edit-user-badge-text-toggle" className="cursor-pointer font-normal">
                {t('admin.users.edit.customTextColor')}
              </Label>
              <span className="text-xs text-muted-foreground">{t('admin.users.edit.textColorHint')}</span>
            </div>
            {useTextOverride && (
              <div className="flex items-center gap-3">
                <Input
                  id="edit-user-badge-text-color"
                  type="color"
                  value={badgeTextColor}
                  onChange={(e) => setBadgeTextColor(e.target.value)}
                  className="h-9 w-20 p-1"
                />
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: badgeColor || '#007a82', color: badgeTextColor }}
                >
                  {badgeName || t('admin.users.edit.preview')}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              <SaveIcon data-icon /> {submitting ? t('admin.users.edit.saving') : t('common.action.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
