import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon, SendIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import type { NotificationDto } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInvalidateNotifications } from '@/client/hooks/use-notifications'
import { onMutationError } from '@/client/lib/toast-api-error'
import { Button } from '@/ui/components/button'
import { Textarea } from '@/ui/components/textarea'
import { cn } from '@/ui/lib/cn'
import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

interface NotificationDetailPaneProps {
  item: NotificationDto
  onBack: () => void
}

// Thread pane: the root message plus its replies as a chat-like transcript,
// with the reply composer gated by the server's canReply verdict.
export function NotificationDetailPane({ item, onBack }: NotificationDetailPaneProps) {
  const invalidate = useInvalidateNotifications()
  const threadQuery = useQuery(orpcQuery.notifications.thread.queryOptions({ input: { threadId: item.threadId } }))
  const markRead = useMutation(orpcQuery.notifications.markRead.mutationOptions({ onSuccess: () => void invalidate() }))

  // Opening an unread message marks it read once; the badge follows the invalidation.
  useEffect(() => {
    if (!item.read) {
      markRead.mutate({ ids: [item.id] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const meta = notificationMeta(item)
  const thread = threadQuery.data

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="iconSm" onClick={onBack} aria-label="返回列表">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{meta.kindLabel}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{item.title}</h3>
          <p className="text-xs text-muted-foreground">
            {item.sender === null ? '系统' : item.sender.name} · {formatNotificationTime(item.createdAt)}
          </p>
        </div>
        {item.actionUrl !== null ? (
          <Button variant="outline" size="sm" className="mt-3 w-fit" render={<Link to={item.actionUrl} />}>
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
                  {message.mine ? '我' : (message.sender?.name ?? '系统')} · {formatNotificationTime(message.createdAt)}
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

function ReplyComposer({ threadId }: { threadId: string }) {
  const [body, setBody] = useState('')
  const invalidate = useInvalidateNotifications()
  const reply = useMutation(
    orpcQuery.notifications.reply.mutationOptions({
      onSuccess: () => {
        setBody('')
        void invalidate()
      },
      onError: onMutationError('回复发送失败'),
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
      <p className="mt-1 px-1 text-[11px] text-muted-foreground/70">⌘/Ctrl + Enter 发送</p>
    </div>
  )
}
