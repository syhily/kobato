import type { MetricRow, MetricType } from '@kobato/api/contracts/analytics'

import { Button } from '@kobato/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@kobato/ui/components/dialog'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { MetricRows } from '@kobato/web-admin/ui/analytics/MetricRows'
import { Maximize2Icon } from 'lucide-react'

export interface MetricDetailsDialogProps {
  title: string
  rows: MetricRow[]
  total: number
  type: MetricType
  onSelect?: (type: MetricType, value: string) => void
}

export function MetricDetailsDialog({ title, rows, total, type, onSelect }: MetricDetailsDialogProps) {
  const { t } = useI18n()
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="link" className="w-full">
            <Maximize2Icon data-icon aria-hidden /> {t('admin.analytics.metrics.details')}
          </Button>
        }
      />
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MetricRows rows={rows} total={total} type={type} onSelect={onSelect} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
