import { CalendarClockIcon, CheckCircle2Icon, CircleDashedIcon, EyeOffIcon } from 'lucide-react'
import { useId } from 'react'

import type { SidebarPublishStatus, SidebarRevisionSummary, SidebarSaveStatus } from '@/ui/admin/posts/PostMetaSidebar'

import { DateTimePicker } from '@/ui/admin/editor-shell/DateTimePicker'
import { Badge } from '@/ui/components/badge'
import { Label } from '@/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group'
import { cn } from '@/ui/lib/cn'

export interface PublishStatusRowProps {
  status: SidebarPublishStatus
  revisionSummary: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  /** Current `<input type="datetime-local">` value (`''` = unset). */
  publishedAt: string
  onChangePublishedAt: (value: string) => void
  disabled?: boolean
}

// "Publish status + publish time" widget shown at the top of 基本信息.
//
// The status badge tells the operator where the post sits in its
// lifecycle ("尚未保存" / "已下线" / "已计划" / "已发布" /
// "已发布（有未发布草稿）"). The publish-time radio toggles between two presets:
//
//   - 立即发布 — `publishedAt` is cleared. The publish action
//     reads "no override" and the server stamps `now()`. (For an
//     already-published post this means "leave the existing
//     timestamp alone"; the publish flow on the editor toolbar
//     re-stamps `now()` if the operator hits 发布 again.)
//
//   - 定时发布 — exposes a `<input type="datetime-local">` so the
//     operator can pick a future time. Sending that to 发布 parks
//     the post as "scheduled" — the public site 404s it until the
//     timestamp arrives.
export function PublishStatusRow({
  status,
  revisionSummary,
  saveStatus,
  publishedAt,
  onChangePublishedAt,
  disabled,
}: PublishStatusRowProps) {
  const fieldId = useId()
  const isScheduled = publishedAt !== ''
  const isFuture = isScheduled && (Date.parse(publishedAt) || 0) > Date.now()

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-1">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">发布状态</Label>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PublishBadge status={status} isFuture={isFuture} />
          <RevisionSummaryInline summary={revisionSummary} />
        </div>
      </div>
      <div className="grid gap-1 border-t border-border/60 pt-3">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">保存状态</Label>
        <SaveStatusLine status={saveStatus} />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">发布时间</Label>
        <RadioGroup
          value={isScheduled ? 'scheduled' : 'now'}
          onValueChange={(next) => {
            if (next === 'now') {
              onChangePublishedAt('')
              return
            }
            if (isScheduled) {
              return
            }
            // Default to "tomorrow at 09:00 local" when the
            // operator first switches into schedule mode, so
            // the picker isn't fighting with the "now" they
            // just opted out of.
            const d = new Date()
            d.setDate(d.getDate() + 1)
            d.setHours(9, 0, 0, 0)
            onChangePublishedAt(dateToLocalInputValue(d))
          }}
          disabled={disabled}
          className="grid-cols-2 gap-2"
        >
          <PublishModeOption
            id={`${fieldId}-now`}
            value="now"
            state={!isScheduled ? 'selected' : 'unselected'}
            label="立即发布"
            description="使用当前时间"
          />
          <PublishModeOption
            id={`${fieldId}-scheduled`}
            value="scheduled"
            state={isScheduled ? 'selected' : 'unselected'}
            label="定时发布"
            description="到点上线"
          />
        </RadioGroup>
        {isScheduled ? (
          <DateTimePicker id={`${fieldId}-at`} value={publishedAt} onChange={onChangePublishedAt} disabled={disabled} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {isScheduled
            ? isFuture
              ? '点击「发布草稿」会按上述时间上线，到时间前公网会返回 404。'
              : '已选择的时间不在未来，点击「发布草稿」会立刻上线。'
            : '点击「发布草稿」会立刻上线，并使用当前时间作为对外展示的发布日期。'}
        </p>
      </div>
    </div>
  )
}

function RevisionSummaryInline({ summary }: { summary: SidebarRevisionSummary | null }) {
  if (summary === null || summary.kind === 'no-revision') {
    return <span className="text-xs text-muted-foreground">当前还没有保存的版本</span>
  }
  return null
}

interface PublishModeOptionProps {
  id: string
  value: string
  state: 'selected' | 'unselected'
  label: string
  description: string
}

function PublishModeOption({ id, value, state, label, description }: PublishModeOptionProps) {
  const isSelected = state === 'selected'
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2 transition-colors',
        isSelected ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-accent/40',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <div className="grid gap-0.5 text-sm leading-tight">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </label>
  )
}

function PublishBadge({ status, isFuture }: { status: SidebarPublishStatus; isFuture: boolean }) {
  switch (status) {
    case 'never-saved':
      return (
        <Badge variant="outline" className="border-status-info-border bg-status-info-bg text-status-info-fg">
          <CircleDashedIcon /> 尚未保存
        </Badge>
      )
    case 'offline':
      return (
        <Badge variant="outline" className="border-status-error-border bg-status-error-bg text-status-error-fg">
          <EyeOffIcon /> 已取消发布
        </Badge>
      )
    case 'scheduled':
      return (
        <Badge variant="outline" className="border-status-info-border bg-status-info-bg text-status-info-fg">
          <CalendarClockIcon /> 已计划发布
        </Badge>
      )
    case 'live':
      // The picker may show "立即发布" while the server is already
      // live; the badge stays "已发布". When the operator switches
      // to a future time the badge alone wouldn't reflect that yet
      // (it only flips on save). Keep it deterministic so the
      // header doesn't flicker as the operator toys with the
      // picker.
      void isFuture
      return (
        <Badge variant="outline" className="border-status-success-border bg-status-success-bg text-status-success-fg">
          <CheckCircle2Icon /> 已发布
        </Badge>
      )
    case 'live-with-draft-ahead':
      return (
        <Badge variant="outline" className="border-status-warn-border bg-status-warn-bg text-status-warn-fg">
          <CheckCircle2Icon /> 已发布（有未发布草稿）
        </Badge>
      )
  }
}

function SaveStatusLine({ status }: { status: SidebarSaveStatus }) {
  switch (status.kind) {
    case 'unsaved':
      return <span className="text-xs text-muted-foreground">未保存</span>
    case 'saving':
      return <span className="text-xs text-muted-foreground">保存中…</span>
    case 'saved':
      return <span className="text-xs text-muted-foreground">{formatSavedAtLocal(status.atMs)}</span>
    case 'error':
      return <span className="text-xs text-destructive">{status.message}</span>
    case 'conflict':
      return <span className="text-xs text-destructive">检测到云端有更新的修订，请刷新后再保存。</span>
    case 'info':
      return <span className="text-xs text-status-warn-fg">{status.message}</span>
  }
}

function formatSavedAtLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Helper used by the schedule-mode radio to drop the operator
// straight into "tomorrow 09:00" — sharing the same
// `YYYY-MM-DDTHH:mm` shape the picker reads from `draft.publishedAt`.
function dateToLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
