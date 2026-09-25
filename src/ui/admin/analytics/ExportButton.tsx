import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { buildAnalyticsInput, type AnalyticsScope, type AnalyticsState } from '@/ui/admin/analytics/use-analytics-state'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'

// CSV export for the current view: pulls `analytics.export` and downloads
// it as a Blob (client-side only — the button disables itself in flight).

export interface ExportButtonProps {
  state: AnalyticsState
  className?: string
  scope?: AnalyticsScope
}

export function ExportButton({ state, className, scope }: ExportButtonProps) {
  const [pending, setPending] = useState(false)

  const download = async () => {
    setPending(true)
    try {
      const csv = await orpc.analytics.export(buildAnalyticsInput(state, { scope, limit: 500 }))
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `kobato-analytics-${formatStamp(state.range.startAt)}-${formatStamp(state.range.endAt)}.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('导出失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => void download()}
      className={cn('h-8 gap-1.5', className)}
    >
      <DownloadIcon data-icon aria-hidden />
      {pending ? '导出中…' : '导出 CSV'}
    </Button>
  )
}

function formatStamp(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
