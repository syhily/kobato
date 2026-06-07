import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { orpcQuery } from '@/client/api/orpc-query'
import { AuditLogTable } from '@/ui/admin/audit/AuditLogTable'
import { AuditLogToolbar } from '@/ui/admin/audit/AuditLogToolbar'
import { useAuditLogController } from '@/ui/admin/audit/useAuditLogController'
import { AdminListPage } from '@/ui/admin/shared/AdminListPage'

interface AuditLogViewProps {
  retentionDays: number
}

export function AuditLogView({ retentionDays }: AuditLogViewProps) {
  const { state, dispatch } = useAuditLogController()

  const listQuery = useQuery(
    orpcQuery.admin.auditLog.list.queryOptions({
      input: {
        offset: state.currentPage * state.pageSize,
        limit: state.pageSize,
        action: state.action || undefined,
        resourceType: state.resourceType || undefined,
        actorId: state.actorId || undefined,
        dateFrom: state.dateFrom || undefined,
        dateTo: state.dateTo || undefined,
      },
    }),
  )

  const actorsQuery = useQuery(orpcQuery.admin.auditLog.actors.queryOptions())

  const actorEmails = useMemo(() => actorsQuery.data?.map((a) => a.email) ?? [], [actorsQuery.data])

  const actorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const actor of actorsQuery.data ?? []) {
      map.set(actor.email, actor.actorId)
    }
    return map
  }, [actorsQuery.data])

  const selectedEmail = useMemo(() => {
    return actorsQuery.data?.find((a) => a.actorId === state.actorId)?.email ?? ''
  }, [actorsQuery.data, state.actorId])

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / state.pageSize)), [total, state.pageSize])

  const exportMutation = useMutation(orpcQuery.admin.auditLog.exportCsv.mutationOptions())

  const handleExport = useCallback(async () => {
    try {
      const result = await exportMutation.mutateAsync({
        action: state.action || undefined,
        resourceType: state.resourceType || undefined,
        actorId: state.actorId || undefined,
        dateFrom: state.dateFrom || undefined,
        dateTo: state.dateTo || undefined,
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
    } catch {
      // Error is surfaced via exportMutation.error / isPending state
    }
  }, [state, exportMutation])

  return (
    <AdminListPage>
      <AdminListPage.Header
        title="审计日志"
        description={`查看系统操作审计记录。仅展示最近 ${retentionDays} 天的数据，更早的记录已归档到 S3。`}
      />

      <AdminListPage.Toolbar>
        <AuditLogToolbar
          action={state.action}
          resourceType={state.resourceType}
          actorEmail={selectedEmail}
          dateFrom={state.dateFrom}
          dateTo={state.dateTo}
          actorEmails={actorEmails}
          onActionChange={(value) => dispatch({ type: 'setAction', value })}
          onResourceTypeChange={(value) => dispatch({ type: 'setResourceType', value })}
          onActorEmailChange={(email) => {
            const id = actorMap.get(email) ?? ''
            dispatch({ type: 'setActorId', value: id })
          }}
          onDateRangeChange={(from, to) => dispatch({ type: 'setDateRange', from, to })}
          onReset={() => dispatch({ type: 'resetFilters' })}
          onExport={() => {
            void handleExport()
          }}
          isExporting={exportMutation.isPending}
        />
        {exportMutation.isError && (
          <p className="text-sm text-destructive">
            导出失败：
            {exportMutation.error instanceof Error ? exportMutation.error.message : '未知错误'}
          </p>
        )}
      </AdminListPage.Toolbar>

      <AdminListPage.Body>
        <AuditLogTable rows={rows} isLoading={listQuery.isPending} />
      </AdminListPage.Body>

      <AdminListPage.PageNavigation
        totalPages={totalPages}
        currentPage={state.currentPage}
        onChange={(page) => dispatch({ type: 'setPage', value: page })}
      />
    </AdminListPage>
  )
}
