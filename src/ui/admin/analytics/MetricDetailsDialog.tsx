import { Maximize2Icon } from 'lucide-react'

import type { MetricRow, MetricType } from '@/shared/contracts/analytics'

import { MetricRows } from '@/ui/admin/analytics/MetricRows'
import { Button } from '@/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/components/dialog'

// Full-set modal behind the card footer's 详情 button — same row rendering
// as the card, scrollable up to the 500-row fetch limit (Slite's
// `metrics/MetricDetailsDialog.vue`).

export interface MetricDetailsDialogProps {
  title: string
  rows: MetricRow[]
  /** Full-set visit sum backing the row percents. */
  total: number
  type: MetricType
  onSelect?: (type: MetricType, value: string) => void
}

export function MetricDetailsDialog({ title, rows, total, type, onSelect }: MetricDetailsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="link" className="w-full">
            <Maximize2Icon data-icon aria-hidden /> 详情
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
