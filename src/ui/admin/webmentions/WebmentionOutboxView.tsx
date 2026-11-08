import { GlobeIcon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'

import type { AdminWebmentionOutboxWire } from '@/shared/contracts/webmentions'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { Badge, type BadgeProps } from '@/ui/components/badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { useI18n } from '@/ui/lib/I18nProvider'

const PAGE_SIZE = 30
const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

type StatusFilter = 'all' | AdminWebmentionOutboxWire['status']

const STATUS_META: Record<
  AdminWebmentionOutboxWire['status'],
  { labelId: UiMessageId; variant: BadgeProps['variant'] }
> = {
  pending: { labelId: 'admin.webmentions.outbox.pending', variant: 'secondary' },
  sent: { labelId: 'admin.webmentions.outbox.sent', variant: 'default' },
  'no-endpoint': { labelId: 'admin.webmentions.outbox.noEndpoint', variant: 'outline' },
  failed: { labelId: 'admin.webmentions.outbox.failed', variant: 'destructive' },
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return typeof value === 'string' && (value === 'all' || value in STATUS_META)
}

function OutboxRow({ row }: { row: AdminWebmentionOutboxWire }) {
  const { t } = useI18n()
  const config = useSiteIdentity()
  const meta = STATUS_META[row.status]
  const date = (iso: string) => formatLocalDate(new Date(iso), ADMIN_DATE_FORMAT, config)
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{t(meta.labelId)}</Badge>
        <a
          href={row.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link text-sm font-medium break-all hover:underline"
        >
          {row.targetUrl}
        </a>
      </div>
      <p className="text-xs break-all text-muted-foreground">
        {t('admin.webmentions.outbox.source', { url: row.sourceUrl })}
        {row.endpoint !== null && <> · {t('admin.webmentions.outbox.endpoint', { url: row.endpoint })}</>}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('admin.webmentions.outbox.queued', { time: date(row.createdAt) })}
        {row.attempts > 0 && ` · ${t('admin.webmentions.outbox.attempts', { count: row.attempts })}`}
        {row.status === 'pending' &&
          row.nextRetryAt !== null &&
          ` · ${t('admin.webmentions.outbox.nextRetry', { time: date(row.nextRetryAt) })}`}
        {row.sentAt !== null && ` · ${t('admin.webmentions.outbox.sentAt', { time: date(row.sentAt) })}`}
        {row.lastError !== null && <span className="text-status-error-fg"> · {row.lastError}</span>}
      </p>
    </div>
  )
}

// Read-only outbound send log — a retry is a republish, so this view offers filters and visibility, never actions.
export function WebmentionOutboxView() {
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.webmentions.outbox,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({
      status: status === 'all' ? undefined : status,
      offset,
      limit: PAGE_SIZE,
    }),
    selectRows: (page) => page.rows,
    noun: 'admin.list.noun.sendHistory',
  })

  return (
    <>
      <AdminListPage.Toolbar>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={status}
            onValueChange={(value: unknown) => {
              if (isStatusFilter(value)) {
                setStatus(value)
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="all">{t('common.filter.all')}</TabsTrigger>
              <TabsTrigger value="pending">{t('admin.webmentions.outbox.pending')}</TabsTrigger>
              <TabsTrigger value="sent">{t('admin.webmentions.outbox.sent')}</TabsTrigger>
              <TabsTrigger value="no-endpoint">{t('admin.webmentions.outbox.noEndpoint')}</TabsTrigger>
              <TabsTrigger value="failed">{t('admin.webmentions.outbox.failed')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link to="/admin/tasks" className="text-link text-sm hover:underline">
            {t('admin.webmentions.outbox.queueHint')}
          </Link>
        </div>
      </AdminListPage.Toolbar>

      <AdminListPage.Body>
        {!isLoading && rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GlobeIcon />
              </EmptyMedia>
              <EmptyTitle>{t('admin.webmentions.outbox.empty')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {rows.map((row, index) =>
              index === rows.length - 1 ? (
                <Fragment key={row.id} ref={sentinelRef}>
                  <OutboxRow row={row} />
                </Fragment>
              ) : (
                <OutboxRow key={row.id} row={row} />
              ),
            )}
          </div>
        )}
        <AdminInfiniteListFooter
          noun={t('admin.list.noun.sendHistory')}
          rowCount={total}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </AdminListPage.Body>
    </>
  )
}
