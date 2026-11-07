import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRightIcon, InboxIcon, Loader2Icon } from 'lucide-react'
import { Fragment } from 'react'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

interface NotificationListPaneProps {
  tab: NotificationTab
  onOpen: (item: NotificationDto) => void
}

const EMPTY_COPY: Record<NotificationTab, string> = {
  all: '暂时没有消息',
  unread: '没有未读消息',
  direct: '还没有私信',
  announce: '还没有公告',
}

// Inbox pane of the drawer: cursor-paginated, newest first, infinite-scroll.
export function NotificationListPane({ tab, onOpen }: NotificationListPaneProps) {
  const query = useInfiniteQuery(
    orpcQuery.notifications.list.infiniteOptions({
      input: (pageParam) => ({ tab, cursor: pageParam === '' ? undefined : pageParam, limit: 20 }),
      initialPageParam: '',
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  )
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    tailKey: items[items.length - 1]?.id,
  })

  if (query.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <p>消息加载失败</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          重试
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <InboxIcon className="size-8" />
        <p className="text-sm">{EMPTY_COPY[tab]}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <ul className="flex flex-col">
        {items.map((item, index) =>
          index === items.length - 1 ? (
            <Fragment ref={sentinelRef} key={item.id}>
              <NotificationRow item={item} onOpen={onOpen} />
            </Fragment>
          ) : (
            <NotificationRow key={item.id} item={item} onOpen={onOpen} />
          ),
        )}
      </ul>
      {query.isFetchingNextPage ? (
        <div className="flex justify-center py-3">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  )
}

function NotificationRow({ item, onOpen }: { item: NotificationDto; onOpen: (item: NotificationDto) => void }) {
  const meta = notificationMeta(item)
  const Icon = meta.icon
  return (
    <li>
      <button
        type="button"
        className={cn(
          'group flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
          !item.read && 'bg-muted/30',
        )}
        onClick={() => onOpen(item)}
      >
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            item.kind === 'direct' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-sm', !item.read ? 'font-semibold' : 'font-medium')}>{item.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatNotificationTime(item.createdAt)}
            </span>
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            <span>{meta.kindLabel}</span>
            <span aria-hidden>·</span>
            <span>{item.sender === null ? '系统' : item.sender.name}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center self-center">
          {!item.read ? <span className="mr-1 size-2 rounded-full bg-primary" aria-label="未读" /> : null}
          <ChevronRightIcon className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </li>
  )
}
