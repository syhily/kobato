import { useState } from 'react'

import type { DateRange } from '@/shared/contracts/analytics'

import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

// Custom from/to range modal (Slite's `CustomDateRangeModal.vue` port):
// two local date-time pickers committed to ?startAt&endAt (unix seconds).

export interface CustomRangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  range: DateRange
  onSelect: (range: DateRange) => void
}

function toLocalInputValue(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value: string): number | null {
  if (!value) {
    return null
  }
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function CustomRangeDialog({ open, onOpenChange, range, onSelect }: CustomRangeDialogProps) {
  const [from, setFrom] = useState(() => toLocalInputValue(range.startAt))
  const [to, setTo] = useState(() => toLocalInputValue(range.endAt))
  const [futureError, setFutureError] = useState(false)

  // The dialog stays mounted between opens — re-seed the inputs from the
  // current range on every open transition so a previously applied range or
  // a preset switch never leaves stale values behind (adjust-during-render,
  // the sanctioned alternative to setState-in-effect).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setFrom(toLocalInputValue(range.startAt))
      setTo(toLocalInputValue(range.endAt))
      setFutureError(false)
    }
  }

  const fromSec = fromLocalInputValue(from)
  const toSec = fromLocalInputValue(to)
  const invalid = fromSec === null || toSec === null || fromSec >= toSec

  const confirm = () => {
    if (invalid || fromSec === null || toSec === null) {
      return
    }
    // The not-in-future rule needs the clock — check it in the handler
    // (impure calls are render-forbidden), not during render.
    if (toSec > Math.floor(Date.now() / 1000) + 60) {
      setFutureError(true)
      return
    }
    setFutureError(false)
    onSelect({ startAt: fromSec, endAt: toSec })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>自定义时间范围</DialogTitle>
          <DialogDescription>选择起止时间，按本地时区应用到统计查询。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-range-from">开始时间</Label>
            <Input
              id="analytics-range-from"
              type="datetime-local"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="analytics-range-to">结束时间</Label>
            <Input
              id="analytics-range-to"
              type="datetime-local"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          {fromSec !== null && toSec !== null && fromSec >= toSec && (
            <p className="text-xs text-destructive">结束时间必须晚于开始时间。</p>
          )}
          {futureError && <p className="text-xs text-destructive">结束时间不能晚于当前时间。</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={invalid} onClick={confirm}>
            应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
