import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { ChevronRightIcon, InboxIcon, Loader2Icon, MailIcon } from 'lucide-react'
import { Fragment, useEffect, useRef } from 'react'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpcQuery } from '@/client/api/orpc-query'
import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { usePatchNotificationReadState } from '@/client/hooks/use-notifications'
import { useNow } from '@/client/hooks/use-now'
import { onMutationError } from '@/client/lib/toast-api-error'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { formatNotificationTime, notificationMeta } from '@/ui/shared/notifications/notification-meta'

interface NotificationListPaneProps {
  tab: NotificationTab
  onOpen: (item: NotificationDto) => void
  /** Row that should regain focus after returning from the thread pane. */
  focusItemId?: string
  /** Called once the requested focus has been placed (or fallen back). */
  onFocusHandled: () => void
}

const EMPTY_COPY_IDS: Record<NotificationTab, UiMessageId> = {
  all: 'notifications.empty.all',
  unread: 'notifications.empty.unread',
  direct: 'notifications.empty.direct',
  announce: 'notifications.empty.announce',
}

// Inbox pane: cursor-paginated, newest first, infinite scroll.
export function NotificationListPane({ tab, onOpen, focusItemId, onFocusHandled }: NotificationListPaneProps) {
  const { t } = useI18n()
  const query = useInfiniteQuery(
    orpcQuery.notifications.list.infiniteOptions({
      input: (pageParam) => ({ tab, cursor: pageParam === '' ? undefined : pageParam, limit: 20 }),
      initialPageParam: '',
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  )
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const now = useNow()
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    tailKey: items[items.length - 1]?.id,
  })
  const listRef = useRef<HTMLDivElement>(null)
  const loadedCount = items.length

  // Returning from a thread restores focus to the row that opened it; when that row is not
  // on the loaded pages the list container takes focus, so the pane swap never strands it.
  useEffect(() => {
    if (focusItemId === undefined || loadedCount === 0 || listRef.current === null) {
      return
    }
    const container = listRef.current
    const row = container.querySelector<HTMLElement>(`[data-notification-row="${focusItemId}"]`)
    ;(row ?? container).focus()
    onFocusHandled()
  }, [focusItemId, loadedCount, onFocusHandled])

  if (query.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // A failed NEXT page leaves loaded rows in `data` with the query in `status: 'error'`,
  // so only an empty result means the pane has nothing to show.
  if (query.isError && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <p>{t('notifications.list.loadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t('common.action.retry')}
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <InboxIcon className="size-8" />
        <p className="text-sm">{t(EMPTY_COPY_IDS[tab])}</p>
      </div>
    )
  }

  return (
    <div ref={listRef} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
      <ul className="flex flex-col">
        {items.map((item, index) =>
          index === items.length - 1 ? (
            <Fragment ref={sentinelRef} key={item.id}>
              <NotificationRow item={item} now={now} onOpen={onOpen} />
            </Fragment>
          ) : (
            <NotificationRow key={item.id} item={item} now={now} onOpen={onOpen} />
          ),
        )}
      </ul>
      {query.isFetchingNextPage ? (
        <div className="flex justify-center py-3">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : query.isFetchNextPageError ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <span>{t('notifications.list.loadMoreFailed')}</span>
          <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()}>
            {t('common.action.retry')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function NotificationRow({
  item,
  now,
  onOpen,
}: {
  item: NotificationDto
  now: number
  onOpen: (item: NotificationDto) => void
}) {
  const meta = notificationMeta(item)
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  const Icon = meta.icon
  const titleId = `notification-row-title-${item.id}`
  const patchReadState = usePatchNotificationReadState()
  const markUnread = useMutation(
    orpcQuery.notifications.markUnread.mutationOptions({
      onSuccess: (data) => patchReadState([item.id], false, data.count),
      onError: onMutationError('admin.toast.operationFailed', t),
    }),
  )
  return (
    <li
      className={cn(
        'group flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60',
        !item.read && 'bg-muted/30',
      )}
    >
      <button
        type="button"
        data-notification-row={item.id}
        aria-labelledby={titleId}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
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
          <span id={titleId} className="flex items-center gap-2">
            {!item.read ? <span className="sr-only">{t('notifications.list.unreadPrefix')}</span> : null}
            <span className={cn('truncate text-sm', !item.read ? 'font-semibold' : 'font-medium')}>{item.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatNotificationTime(item.createdAt, { locale, timeZone, now })}
            </span>
          </span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            <span>{t(meta.kindLabelId)}</span>
            <span aria-hidden>·</span>
            <span>{item.sender === null ? t('notifications.list.system') : item.sender.name}</span>
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center self-center">
        {!item.read ? (
          <span aria-hidden className="mr-1 size-2 rounded-full bg-primary" />
        ) : (
          <button
            type="button"
            aria-label={t('notifications.list.markUnread')}
            disabled={markUnread.isPending}
            className="mr-1 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
            onClick={() => markUnread.mutate({ ids: [item.id] })}
          >
            <MailIcon className="size-4" />
          </button>
        )}
        <ChevronRightIcon className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      </span>
    </li>
  )
}
