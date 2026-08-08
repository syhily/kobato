import { GlobeIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminWebmentionOutboxWire } from '@/shared/contracts/webmentions'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { Badge, type BadgeProps } from '@/ui/components/badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Tabs, TabsList, TabsTrigger } from '@/ui/components/tabs'

const PAGE_SIZE = 30
const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm:ss'

type StatusFilter = 'all' | AdminWebmentionOutboxWire['status']

const STATUS_META: Record<AdminWebmentionOutboxWire['status'], { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: '待发送', variant: 'secondary' },
  sent: { label: '已发送', variant: 'default' },
  'no-endpoint': { label: '无端点', variant: 'outline' },
  failed: { label: '失败', variant: 'destructive' },
}

function OutboxRow({ row }: { row: AdminWebmentionOutboxWire }) {
  const config = useSiteIdentity()
  const meta = STATUS_META[row.status]
  const date = (iso: string) => formatLocalDate(new Date(iso), ADMIN_DATE_FORMAT, config)
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
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
        来源 {row.sourceUrl}
        {row.endpoint !== null && <> · 端点 {row.endpoint}</>}
      </p>
      <p className="text-xs text-muted-foreground">
        入队 {date(row.createdAt)}
        {row.attempts > 0 && ` · 已尝试 ${row.attempts} 次`}
        {row.status === 'pending' && row.nextRetryAt !== null && ` · 下次重试 ${date(row.nextRetryAt)}`}
        {row.sentAt !== null && ` · 发送于 ${date(row.sentAt)}`}
        {row.lastError !== null && <span className="text-status-error-fg"> · {row.lastError}</span>}
      </p>
    </div>
  )
}

// Read-only outbound send log — a retry is a republish, so this view offers filters and visibility, never actions.
export function WebmentionOutboxView() {
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
    noun: '发送记录',
  })

  return (
    <>
      <AdminListPage.Toolbar>
        <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="pending">待发送</TabsTrigger>
            <TabsTrigger value="sent">已发送</TabsTrigger>
            <TabsTrigger value="no-endpoint">无端点</TabsTrigger>
            <TabsTrigger value="failed">失败</TabsTrigger>
          </TabsList>
        </Tabs>
      </AdminListPage.Toolbar>

      <AdminListPage.Body>
        {!isLoading && rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GlobeIcon />
              </EmptyMedia>
              <EmptyTitle>暂无发送记录</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <OutboxRow key={row.id} row={row} />
            ))}
          </div>
        )}
        <div ref={sentinelRef} />
        <AdminInfiniteListFooter
          noun="条发送记录"
          rowCount={total}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      </AdminListPage.Body>
    </>
  )
}
