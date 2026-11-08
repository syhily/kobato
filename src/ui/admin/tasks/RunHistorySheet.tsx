import { Fragment, useState } from 'react'

import type { JobHistoryInput, JobRunDto, JobRunTrigger } from '@/shared/contracts/jobs'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { orpcQuery } from '@/client/api/orpc-query'
import { formatDuration } from '@/shared/i18n/format'
import { AdminInfiniteListFooter } from '@/ui/admin/shared/AdminInfiniteListFooter'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'
import { RUN_STATUS_META, jobRunErrorLabelId, useFormatAdminDate } from '@/ui/admin/tasks/meta'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/ui/components/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/components/sheet'
import { useI18n } from '@/ui/lib/I18nProvider'

const PAGE_SIZE = 20

const TRIGGER_LABEL_IDS: Record<JobRunTrigger, UiMessageId> = {
  scheduled: 'admin.tasks.history.trigger.scheduled',
  manual: 'admin.tasks.history.trigger.manual',
}

/** Pure row — exported so snapshot tests can render it without the client-only Sheet portal. */
export function RunHistoryRow({ run }: { run: JobRunDto }) {
  const date = useFormatAdminDate()
  const { locale, t } = useI18n()
  const meta = RUN_STATUS_META[run.status]
  const errorLabelId = jobRunErrorLabelId(run.error)
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{t(meta.labelId)}</Badge>
        <span className="text-xs text-muted-foreground">
          {t('admin.tasks.history.triggered', { trigger: t(TRIGGER_LABEL_IDS[run.trigger]) })}
        </span>
        <span className="text-xs text-muted-foreground">{date(run.startedAt)}</span>
      </div>
      {(run.durationMs !== null || run.status === 'running' || run.error !== null) && (
        <p className="text-xs text-muted-foreground">
          {run.durationMs !== null &&
            t('admin.tasks.history.duration', { duration: formatDuration(run.durationMs, { locale }) })}
          {run.status === 'running' && t('admin.tasks.history.running')}
          {run.error !== null && (
            <span className="text-status-error-fg">{errorLabelId === null ? run.error : t(errorLabelId)}</span>
          )}
        </p>
      )}
    </div>
  )
}

// Per-task run history in a right-side sheet (RevisionsDrawer precedent — the
// project has no standalone drawer). The list only arms while the sheet is
// open, and polls every 10s (list-page cadence) so 「仍在运行」 rows refresh.
export function RunHistorySheet({ taskKey, taskLabel }: { taskKey: JobHistoryInput['taskKey']; taskLabel: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const { rows, total, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.jobs.history,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({ taskKey, offset, limit: PAGE_SIZE }),
    selectRows: (page) => page.items,
    noun: 'admin.list.noun.runHistory',
    enabled: open,
    refetchInterval: 10_000,
  })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" type="button">
            {t('admin.tasks.history.title')}
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-140">
        <SheetHeader>
          <SheetTitle>{t('admin.tasks.history.sheetTitle', { task: taskLabel })}</SheetTitle>
          <SheetDescription>{t('admin.tasks.history.description')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {!isLoading && rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('admin.tasks.history.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {rows.map((run, index) =>
                index === rows.length - 1 ? (
                  <Fragment key={run.id} ref={sentinelRef}>
                    <RunHistoryRow run={run} />
                  </Fragment>
                ) : (
                  <RunHistoryRow key={run.id} run={run} />
                ),
              )}
            </div>
          )}
          <AdminInfiniteListFooter
            noun={t('admin.list.noun.runHistory')}
            rowCount={total}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
