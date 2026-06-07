import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { orpc } from '@/client/api/client'
import { idStr } from '@/shared/utils/tools'
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

const DEFAULT_BADGE_TEXT_COLOR = '#ffffff'

export interface EditUserDialogProps {
  comment: AdminComment | null
  onClose: () => void
  onSaved: () => void
}

export function EditUserDialog({ comment, onClose, onSaved }: EditUserDialogProps) {
  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | null>) => {
      const { id, ...body } = payload
      return orpc.admin.users.update({ id: id!, ...body })
    },
    onSuccess: () => onSaved(),
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [badgeName, setBadgeName] = useState('')
  const [badgeColor, setBadgeColor] = useState('#008c95')
  const [useTextOverride, setUseTextOverride] = useState(false)
  const [badgeTextColor, setBadgeTextColor] = useState(DEFAULT_BADGE_TEXT_COLOR)

  useEffect(() => {
    if (!comment) {
      return
    }
    setName(comment.name)
    setEmail(comment.email)
    setLink(comment.link ?? '')
    setBadgeName(comment.badgeName ?? '')
    setBadgeColor(comment.badgeColor ?? '#008c95')
    setUseTextOverride(comment.badgeTextColor !== null && comment.badgeTextColor !== undefined)
    setBadgeTextColor(comment.badgeTextColor ?? DEFAULT_BADGE_TEXT_COLOR)
  }, [comment])

  const open = comment !== null
  const submitting = mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑评论用户</DialogTitle>
          <DialogDescription>修改用户名、邮箱、链接以及徽章信息。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            // Use `string | null` so we can explicitly clear the badge
            // text-colour override (sends a literal JSON `null`); empty
            // strings get filtered/normalised on the server.
            const payload: Record<string, string | null> = {
              name,
              email,
              id: idStr(comment.userId),
            }
            if (link) {
              payload.link = link
            }
            if (badgeName) {
              payload.badgeName = badgeName
            }
            if (badgeColor) {
              payload.badgeColor = badgeColor
            }
            // Always include `badgeTextColor` so admins can also clear a
            // previous override by unticking the checkbox.
            payload.badgeTextColor = useTextOverride ? badgeTextColor : null
            mutation.mutate(payload)
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-name">用户名</Label>
            <Input id="edit-user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-email">邮箱</Label>
            <Input
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="edit-user-link">网站链接</Label>
            <Input
              id="edit-user-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-badge-name">徽章名称</Label>
            <Input
              id="edit-user-badge-name"
              type="text"
              value={badgeName}
              onChange={(e) => setBadgeName(e.target.value)}
              placeholder="MOD / VIP"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Label htmlFor="edit-user-badge-color">徽章颜色</Label>
            <Input
              id="edit-user-badge-color"
              type="color"
              value={badgeColor}
              onChange={(e) => setBadgeColor(e.target.value)}
              className="h-9 p-1"
            />
          </div>
          {/*
           * Optional badge text-colour override. Same UX as the user
           * detail page (see `UserDetailView.tsx`): a checkbox gates a
           * picker + live preview chip so the chosen swatch is visible
           * against the current background before saving.
           */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-user-badge-text-toggle"
                checked={useTextOverride}
                onCheckedChange={(next) => setUseTextOverride(next === true)}
              />
              <Label htmlFor="edit-user-badge-text-toggle" className="cursor-pointer font-normal">
                自定义徽章字体颜色
              </Label>
              <span className="text-xs text-muted-foreground">未勾选时按背景自动选择黑/白对比色</span>
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
                  style={{ backgroundColor: badgeColor || '#008c95', color: badgeTextColor }}
                >
                  {badgeName || '预览'}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={submitting}>
              <SaveIcon data-icon /> {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
