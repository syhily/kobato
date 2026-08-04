import { orpcQuery } from '@kobato/client/api/orpc-query'
import { Button } from '@kobato/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/ui/components/dialog'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { SendIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onInvited: () => void
}

export function InviteAuthorDialog({ open, onClose, onInvited }: Props) {
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
          <DialogTitle>邀请作者</DialogTitle>
          <DialogDescription>向新作者发送邀请邮件，对方点击链接即可设置密码并登录。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate({ name, email })
          }}
          className="grid gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">姓名</Label>
            <Input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="作者姓名"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">邮箱</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="author@example.com"
              required
            />
          </div>
          {!!error && <div className="text-sm text-destructive">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={submitting}>
              <SendIcon data-icon /> {submitting ? '发送中…' : '发送邀请'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
