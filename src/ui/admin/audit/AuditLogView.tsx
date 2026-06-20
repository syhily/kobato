import { useMutation, useQuery } from '@tanstack/react-query'
import { DownloadIcon, LoaderIcon, SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { orpcQuery } from '@/client/api/orpc-query'
import { getLogger } from '@/client/lib/logger'
import { AuditLogFilterBar } from '@/ui/admin/audit/AuditLogFilterBar'
import { AuditLogRow } from '@/ui/admin/audit/AuditLogRow'
import {
  parseDateFilter,
  type AuditLogFilterFieldKey,
  useAuditLogController,
} from '@/ui/admin/audit/useAuditLogController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'
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
import { Button } from '@/ui/components/button'
import { Checkbox } from '@/ui/components/checkbox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import { Skeleton } from '@/ui/components/skeleton'

const PAGE_SIZE = 20
const log = getLogger('audit.AuditLogView')

interface AuditLogViewProps {
  retentionDays: number
}

export function AuditLogView({ retentionDays }: AuditLogViewProps) {
  const { state, dispatch } = useAuditLogController()

  const [isLoading, setIsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [includeFullIp, setIncludeFullIp] = useState(false)
  const lastQueryKeyRef = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const actorsQuery = useQuery(orpcQuery.admin.auditLog.actors.queryOptions())
  const actors = useMemo(() => actorsQuery.data ?? [], [actorsQuery.data])

  const exportMutation = useMutation(orpcQuery.admin.auditLog.exportCsv.mutationOptions())

  const buildQueryInput = useCallback(
    (offset: number) => {
      const action = state.filters.find((f) => f.field === 'action')?.value
      const resourceType = state.filters.find((f) => f.field === 'resourceType')?.value
      const actorId = state.filters.find((f) => f.field === 'actor')?.value
      const ip = state.filters.find((f) => f.field === 'ip')?.value
      const dateValue = state.filters.find((f) => f.field === 'date')?.value
      const dateRange = parseDateFilter(dateValue)

      return {
        offset,
        limit: PAGE_SIZE,
        ...(action ? { action } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(actorId ? { actorId } : {}),
        ...(ip ? { ip } : {}),
        ...(dateRange?.from ? { dateFrom: dateRange.from } : {}),
        ...(dateRange?.to ? { dateTo: dateRange.to } : {}),
      }
    },
    [state.filters],
  )

  const loadItems = useCallback(
    async (input: { offset: number; limit: number }) => {
      setIsLoading(true)
      try {
        const result = await orpc.admin.auditLog.list(input)
        dispatch({
          type: 'loaded',
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
        })
      } catch (error) {
        toast.error('加载审计日志失败', { description: error instanceof Error ? error.message : String(error) })
      } finally {
        setIsLoading(false)
      }
    },
    [dispatch],
  )

  const reload = useCallback(
    (force = false) => {
      const input = buildQueryInput(0)
      const key = JSON.stringify(input)
      if (!force && key === lastQueryKeyRef.current) {
        return
      }
      lastQueryKeyRef.current = key
      void loadItems(input)
    },
    [loadItems, buildQueryInput],
  )

  useEffect(() => {
    reload()
  }, [reload])

  const loadMore = useCallback(async () => {
    if (loadingMore || !state.hasMore) {
      return
    }
    setLoadingMore(true)
    try {
      const result = await orpc.admin.auditLog.list(buildQueryInput(state.items.length))
      dispatch({
        type: 'appended',
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
      })
    } catch (error) {
      toast.error('加载更多审计日志失败')
      log.warn('Failed to load more audit logs', { error })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, state.hasMore, buildQueryInput, state.items.length, dispatch])

  useEffect(() => {
    if (!state.hasMore) {
      return
    }
    const el = sentinelRef.current
    if (!el) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [state.hasMore, loadMore])

  const handleExport = useCallback(async () => {
    try {
      const input = buildQueryInput(0)
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
  }, [buildQueryInput, exportMutation, includeFullIp])

  const handleAddFilter = useCallback(
    (field: AuditLogFilterFieldKey, value: string, label: string) => {
      dispatch({ type: 'addFilter', field, value, label })
    },
    [dispatch],
  )

  const handleRemoveFilter = useCallback(
    (field: AuditLogFilterFieldKey) => {
      dispatch({ type: 'removeFilter', field })
    },
    [dispatch],
  )

  const handleClearFilters = useCallback(() => {
    dispatch({ type: 'clearFilters' })
  }, [dispatch])

  const hasActiveFilters = state.filters.length > 0

  const filterBar = (
    <AuditLogFilterBar
      filters={state.filters}
      onAddFilter={handleAddFilter}
      onRemoveFilter={handleRemoveFilter}
      onClearFilters={handleClearFilters}
      actors={actors}
    />
  )

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
        <div className="divide-y">
          {isLoading ? (
            <AuditLogSkeleton />
          ) : state.items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>暂无审计日志记录</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            state.items.map((row) => <AuditLogRow key={row.id} row={row} />)
          )}
        </div>

        {state.hasMore && <div ref={sentinelRef} className="h-1" />}
        {(loadingMore || (!state.hasMore && state.items.length > 0)) && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" />
                加载中…
              </span>
            ) : (
              '已加载全部审计日志'
            )}
          </div>
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
      {Array.from({ length: 3 }).map((_, i) => (
        // Skeleton placeholders — static-length array, index is stable.
        <div key={i} className="px-4 py-3">
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
