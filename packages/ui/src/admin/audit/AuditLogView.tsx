import { orpcQuery } from '@kobato/client/api/orpc-query'
import { AuditLogRow } from '@kobato/ui/admin/audit/AuditLogRow'
import { type AuditFilterQuery, buildAuditFilterFields } from '@kobato/ui/admin/audit/filter-fields'
import { AdminInfiniteListFooter } from '@kobato/ui/admin/shared/AdminInfiniteListFooter'
import { AdminListPage } from '@kobato/ui/admin/shared/AdminListPage'
import { FilterPillBar } from '@kobato/ui/admin/shared/filter-bar/FilterPillBar'
import { useFilterPills } from '@kobato/ui/admin/shared/filter-bar/useFilterPills'
import { useAdminInfiniteList } from '@kobato/ui/admin/shared/useAdminInfiniteList'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kobato/ui/components/alert-dialog'
import { Button } from '@kobato/ui/components/button'
import { Checkbox } from '@kobato/ui/components/checkbox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@kobato/ui/components/empty'
import { Skeleton } from '@kobato/ui/components/skeleton'
import { skeletonKeys } from '@kobato/ui/lib/skeleton-keys'
import { useMutation, useQuery } from '@tanstack/react-query'
import { DownloadIcon, SearchIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

const PAGE_SIZE = 20

interface AuditLogViewProps {
  retentionDays: number
}

export function AuditLogView({ retentionDays }: AuditLogViewProps) {
  const actorsQuery = useQuery(orpcQuery.admin.auditLog.actors.queryOptions())
  const actors = useMemo(() => actorsQuery.data ?? [], [actorsQuery.data])
  const fields = useMemo(() => buildAuditFilterFields(actors), [actors])
  const pills = useFilterPills({ fields })

  const [exportOpen, setExportOpen] = useState(false)
  const [includeFullIp, setIncludeFullIp] = useState(false)

  const { rows, isLoading, hasNextPage, isFetchingNextPage, sentinelRef } = useAdminInfiniteList({
    namespace: orpcQuery.admin.auditLog.list,
    pageSize: PAGE_SIZE,
    buildInput: (offset) => ({ offset, limit: PAGE_SIZE, ...pills.queryInput<AuditFilterQuery>() }),
    selectRows: (page) => page.items,
    noun: '审计日志',
  })

  const exportMutation = useMutation(orpcQuery.admin.auditLog.exportCsv.mutationOptions())

  const { queryInput } = pills
  const handleExport = useCallback(async () => {
    try {
      const input = queryInput<AuditFilterQuery>()
      const result = await exportMutation.mutateAsync({
        action: input.action,
        resourceType: input.resourceType,
        actorId: input.actorId,
        ip: input.ip,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        includeFullIp,
      })

      const blob = new Blob([result], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setExportOpen(false)
    } catch {
      // Error is surfaced via exportMutation.error / isPending state
    }
  }, [queryInput, exportMutation, includeFullIp])

  const hasActiveFilters = pills.hasFilters

  const filterBar = <FilterPillBar {...pills.bar} />

  return (
    <AdminListPage>
      <AdminListPage.Header
        title="审计日志"
        description={`查看系统操作审计记录。仅展示最近 ${retentionDays} 天的数据，更早的记录已归档到 S3。`}
      >
        <div className="flex items-center gap-2">
          {!hasActiveFilters && filterBar}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setIncludeFullIp(false)
              setExportOpen(true)
            }}
            disabled={exportMutation.isPending}
          >
            <DownloadIcon data-icon className="mr-1" />
            {exportMutation.isPending ? '导出中…' : '导出 CSV'}
          </Button>
        </div>
      </AdminListPage.Header>

      {hasActiveFilters && filterBar}

      <AdminListPage.Body>
        {isLoading ? (
          <div className="divide-y">
            <AuditLogSkeleton />
          </div>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>暂无审计日志记录</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="divide-y">
              {rows.map((row) => (
                <AuditLogRow key={row.id} row={row} />
              ))}
            </div>
            {hasNextPage && <div ref={sentinelRef} className="h-1" />}
            <AdminInfiniteListFooter
              noun="审计日志"
              rowCount={rows.length}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
            />
          </>
        )}
      </AdminListPage.Body>

      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>导出审计日志 CSV</AlertDialogTitle>
            <AlertDialogDescription>将导出当前筛选条件下的审计日志记录。</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2 py-2">
            <Checkbox
              id="include-full-ip"
              checked={includeFullIp}
              onCheckedChange={(checked) => setIncludeFullIp(checked === true)}
            />
            <label htmlFor="include-full-ip" className="cursor-pointer text-sm leading-tight">
              导出完整 IP 地址（默认脱敏导出）
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleExport()} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? '导出中…' : '导出'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminListPage>
  )
}

function AuditLogSkeleton() {
  return (
    <>
      {skeletonKeys(3).map((key) => (
        <div key={key} className="px-4 py-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </>
  )
}
