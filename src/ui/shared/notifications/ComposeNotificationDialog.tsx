import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckIcon, Loader2Icon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AdminUserDto } from '@/shared/contracts/users'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInvalidateNotifications } from '@/client/hooks/use-notifications'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useDebouncedSearch } from '@/ui/admin/shared/useDebouncedSearch'
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
import { Switch } from '@/ui/components/switch'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { Textarea } from '@/ui/components/textarea'
import { cn } from '@/ui/lib/cn'

interface ComposeNotificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ComposeMode = 'direct' | 'broadcast'

function isComposeMode(value: unknown): value is ComposeMode {
  return value === 'direct' || value === 'broadcast'
}

// Admin-only compose dialog: a private message to one user, or a broadcast
// to everyone (optionally answerable).
export function ComposeNotificationDialog({ open, onOpenChange }: ComposeNotificationDialogProps) {
  const [mode, setMode] = useState<ComposeMode>('broadcast')
  const [recipient, setRecipient] = useState<AdminUserDto | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [replyable, setReplyable] = useState(false)
  const invalidate = useInvalidateNotifications()

  const reset = () => {
    setMode('broadcast')
    setRecipient(null)
    setTitle('')
    setBody('')
    setReplyable(false)
  }

  const sendDirect = useMutation(
    orpcQuery.admin.notifications.sendDirect.mutationOptions({
      onSuccess: () => {
        toast.success('私信已发送')
        void invalidate()
        reset()
        onOpenChange(false)
      },
      onError: onMutationError('私信发送失败'),
    }),
  )
  const sendBroadcast = useMutation(
    orpcQuery.admin.notifications.sendBroadcast.mutationOptions({
      onSuccess: () => {
        toast.success('公告已发布')
        void invalidate()
        reset()
        onOpenChange(false)
      },
      onError: onMutationError('公告发布失败'),
    }),
  )
  const pending = sendDirect.isPending || sendBroadcast.isPending

  const submit = () => {
    if (mode === 'direct') {
      if (recipient === null) {
        toast.error('请选择收件人')
        return
      }
      sendDirect.mutate({ userId: recipient.id, title: title.trim(), body: body.trim() })
    } else {
      sendBroadcast.mutate({ title: title.trim(), body: body.trim(), replyable })
    }
  }

  const ready = title.trim() !== '' && body.trim() !== '' && (mode === 'broadcast' || recipient !== null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>写消息</DialogTitle>
          <DialogDescription>给某位用户发私信，或向全站发布公告。</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => isComposeMode(value) && setMode(value)}>
          <TabsList className="w-full">
            <TabsTrigger value="broadcast" className="flex-1">
              公告
            </TabsTrigger>
            <TabsTrigger value="direct" className="flex-1">
              私信
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3">
          {mode === 'direct' ? <RecipientPicker value={recipient} onChange={setRecipient} /> : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compose-title">标题</Label>
            <Input
              id="compose-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="一句话说明主题"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compose-body">内容</Label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="正文内容"
            />
          </div>
          {mode === 'broadcast' ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>
                允许回复
                <span className="block text-xs text-muted-foreground">用户的回复会发送给全体管理员</span>
              </span>
              <Switch checked={replyable} onCheckedChange={setReplyable} aria-label="允许回复" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!ready || pending}>
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {mode === 'direct' ? '发送私信' : '发布公告'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecipientPicker({ value, onChange }: { value: AdminUserDto | null; onChange: (user: AdminUserDto) => void }) {
  const [q, setQ] = useState('')
  const [keyword, setKeyword] = useDebouncedSearch({ onChange: (value) => setQ(value) })
  const search = useQuery(
    orpcQuery.admin.users.list.queryOptions({
      input: { q: q.trim() === '' ? undefined : q.trim(), limit: 8, offset: 0 },
    }),
  )
  const users = search.data?.users ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="compose-recipient">收件人</Label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          id="compose-recipient"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索用户名或邮箱"
          className="pl-8"
        />
      </div>
      {value !== null ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span>
            {value.name}
            <span className="ml-2 text-xs text-muted-foreground">{value.email}</span>
          </span>
          <CheckIcon className="size-4 text-primary" />
        </div>
      ) : null}
      <ul className="flex max-h-44 flex-col overflow-y-auto rounded-lg border">
        {users.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            {search.isPending ? '搜索中…' : search.isError ? '搜索失败，请重试' : '没有匹配的用户'}
          </li>
        ) : (
          users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                  value?.id === user.id && 'bg-muted/40',
                )}
                onClick={() => onChange(user)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                {value?.id === user.id ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
