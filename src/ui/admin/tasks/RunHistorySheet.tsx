import { useState } from 'react'

import type { JobHistoryInput, JobRunDto, JobRunTrigger } from '@/shared/contracts/jobs'

import { orpcQuery } from '@/client/api/orpc-query'
import { formatDurationMs } from '@/shared/utils/formatter'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { RUN_STATUS_META, useFormatAdminDate } from '@/ui/admin/tasks/meta'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/ui/components/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/components/sheet'

const PAGE_SIZE = 20

const TRIGGER_LABEL: Record<JobRunTrigger, string> = {
  scheduled: '定时',
  manual: '手动',
}

/** Pure row — exported so snapshot tests can render it without the client-only Sheet portal. */
export function RunHistoryRow({ run }: { run: JobRunDto }) {
  const date = useFormatAdminDate()
  const meta = RUN_STATUS_META[run.status]
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground">{`${TRIGGER_LABEL[run.trigger]}触发`}</span>
        <span className="text-xs text-muted-foreground">{date(run.startedAt)}</span>
      </div>
      {(run.durationMs !== null || run.status === 'running' || run.error !== null) && (
        <p className="text-xs text-muted-foreground">
          {run.durationMs !== null && `耗时 ${formatDurationMs(run.durationMs)}`}
          {run.status === 'running' && '仍在运行'}
          {run.error !== null && <span className="text-status-error-fg">{run.error}</span>}
        </p>
      )}
    </div>
  )
}

// Per-task run history in a right-side sheet (RevisionsDrawer precedent — the
// project has no standalone drawer). The list only arms while the sheet is
// open, and polls every 10s (list-page cadence) so 「仍在运行」 rows refresh.
export function RunHistorySheet({ taskKey, taskLabel }: { taskKey: JobHistoryInput['taskKey']; taskLabel: string }) {
  const [open, setOpen] = useState(false)

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.jobs.history,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({ taskKey, offset, limit: PAGE_SIZE }),
    selectRows: (page) => page.items,
    noun: '执行历史',
    enabled: open,
    refetchInterval: 10_000,
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" type="button">
            执行历史
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-140">
        <SheetHeader>
          <SheetTitle>{taskLabel} · 执行历史</SheetTitle>
          <SheetDescription>每次执行的结果、耗时与错误信息；历史保留最近 30 天。</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {!isLoading && rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无执行记录</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {rows.map((run) => (
                <RunHistoryRow key={run.id} run={run} />
              ))}
            </div>
          )}
          <div ref={sentinelRef} />
          <AdminInfiniteListFooter
            noun="条执行记录"
            rowCount={total}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
