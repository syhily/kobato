import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon, SendIcon, Undo2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import type { NotificationDto } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInvalidateNotifications, usePatchNotificationReadState } from '@/client/hooks/use-notifications'
import { useNow } from '@/client/hooks/use-now'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
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
import { Button, buttonVariants } from '@/ui/components/button'
import { Textarea } from '@/ui/components/textarea'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

interface NotificationDetailPaneProps {
  item: NotificationDto
  /** Admins can recall announcements / system alerts (never direct messages). */
  isAdmin: boolean
  onBack: () => void
  /** Closes the host drawer; the 去处理 link navigates underneath it. */
  onClose: () => void
}

/** True when a reply landed in a different thread than the one it was sent from. */
export function isForkReply(currentThreadId: string, resultThreadId: string): boolean {
  return resultThreadId !== currentThreadId
}

// Thread pane: the root message plus its replies as a chat-like transcript,
// with the reply composer gated by the server's canReply verdict.
export function NotificationDetailPane({ item, isAdmin, onBack, onClose }: NotificationDetailPaneProps) {
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const invalidate = useInvalidateNotifications()
  const patchReadState = usePatchNotificationReadState()
  const threadQuery = useQuery(orpcQuery.notifications.thread.queryOptions({ input: { threadId: item.threadId } }))
  const markRead = useMutation(
    orpcQuery.notifications.markRead.mutationOptions({
      onSuccess: (data) => patchReadState([item.id], true, data.count),
      onError: onMutationError('admin.toast.markReadFailed', t),
    }),
  )
  const recall = useMutation(
    orpcQuery.admin.notifications.recall.mutationOptions({
      onSuccess: () => {
        void invalidate()
        onBack()
      },
      onError: onMutationError('admin.toast.recallFailed', t),
    }),
  )

  const [recallConfirmOpen, setRecallConfirmOpen] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)

  // The pane swap replaces the list in place, so focus must be placed here
  // explicitly — otherwise it falls to the document body on open.
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  // Opening an unread message marks it read once; the patch carries the
  // server's authoritative count into the badge.
  useEffect(() => {
    if (!item.read) {
      markRead.mutate({ ids: [item.id] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const meta = notificationMeta(item)
  const thread = threadQuery.data
  const now = useNow()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2 pr-12">
        <Button ref={backRef} variant="ghost" size="iconSm" onClick={onBack} aria-label="返回列表">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{t(meta.kindLabelId)}</span>
        {isAdmin && item.kind !== 'direct' ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setRecallConfirmOpen(true)}
            disabled={recall.isPending}
          >
            {recall.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <Undo2Icon className="size-3.5" />}
            撤回
          </Button>
        ) : null}
      </div>
      <AlertDialog open={recallConfirmOpen} onOpenChange={setRecallConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤回这条消息？</AlertDialogTitle>
            <AlertDialogDescription>
              确定撤回「{item.title}」吗？撤回后所有收件人都将看不到这条消息。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={recall.isPending}
              onClick={() => recall.mutate({ id: item.id })}
            >
              撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{item.title}</h3>
          <p className="text-xs text-muted-foreground">
            {item.sender === null ? '系统' : item.sender.name} ·{' '}
            {formatNotificationTime(item.createdAt, { locale, timeZone, now })}
          </p>
        </div>
        {item.actionUrl !== null ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-fit"
            onClick={onClose}
            render={<Link to={item.actionUrl} />}
          >
            <ExternalLinkIcon className="size-3.5" /> 去处理
          </Button>
        ) : null}
        {threadQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : threadQuery.isError || thread === undefined ? (
          <p className="py-10 text-center text-sm text-muted-foreground">消息内容加载失败</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {thread.messages.map((message) => (
              <div key={message.id} className={cn('flex flex-col gap-1', message.mine ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
                    message.mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
                  )}
                >
                  {message.body}
                </div>
                <span className="px-1 text-[11px] text-muted-foreground/80">
                  {message.mine ? '我' : (message.sender?.name ?? '系统')} ·{' '}
                  {formatNotificationTime(message.createdAt, { locale, timeZone, now })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {thread?.canReply ? <ReplyComposer threadId={item.threadId} /> : null}
    </div>
  )
}

const REPLY_HINT_ID = 'notification-reply-shortcut-hint'

function ReplyComposer({ threadId }: { threadId: string }) {
  const { t } = useI18n()
  const [body, setBody] = useState('')
  const invalidate = useInvalidateNotifications()
  const reply = useMutation(
    orpcQuery.notifications.reply.mutationOptions({
      onSuccess: (data) => {
        setBody('')
        // A broadcast reply lands in a freshly forked private thread, so the
        // user stays on an announcement thread that never shows the reply —
        // explain the move instead of letting them retype it.
        if (isForkReply(threadId, data.threadId)) {
          toast.success('已发送，回复已转入私信，管理员会私信回复你')
        }
        void invalidate()
      },
      onError: onMutationError('admin.toast.replySendFailed', t),
    }),
  )

  const submit = () => {
    const trimmed = body.trim()
    if (trimmed === '' || reply.isPending) {
      return
    }
    reply.mutate({ threadId, body: trimmed })
  }

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="输入回复…"
          aria-label="回复内容"
          aria-describedby={REPLY_HINT_ID}
          rows={2}
          maxLength={5000}
          className="min-h-10 flex-1 resize-none"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
        <Button size="icon" onClick={submit} disabled={body.trim() === '' || reply.isPending} aria-label="发送回复">
          {reply.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
        </Button>
      </div>
      <p id={REPLY_HINT_ID} className="mt-1 px-1 text-[11px] text-muted-foreground/70">
        ⌘/Ctrl + Enter 发送
      </p>
    </div>
  )
}
