import { CalendarClockIcon, CheckCircle2Icon, CircleDashedIcon, EyeOffIcon } from 'lucide-react'
import { useId, useState } from 'react'

import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { formatDateTime } from '@/shared/i18n/format'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { DateTimePicker } from '@/ui/admin/editor-shell/DateTimePicker'
import { dateToLocalInputValue } from '@/ui/admin/editor-shell/editor-datetime'
import { LabelledRadioCard } from '@/ui/admin/shared/LabelledRadio'
import { Badge } from '@/ui/components/badge'
import { Label } from '@/ui/components/label'
import { RadioGroup } from '@/ui/components/radio-group'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface PublishStatusRowProps {
  status: SidebarPublishStatus
  revisionSummary: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  /** Current `<input type="datetime-local">` value (`''` = unset). */
  publishedAt: string
  onChangePublishedAt: (value: string) => void
  disabled?: boolean
}

export function PublishStatusRow({
  status,
  revisionSummary,
  saveStatus,
  publishedAt,
  onChangePublishedAt,
  disabled,
}: PublishStatusRowProps) {
  const { t } = useI18n()
  const fieldId = useId()
  const isScheduled = publishedAt !== ''
  const [now] = useState(() => Date.now())
  const isFuture = isScheduled && (Date.parse(publishedAt) || 0) > now

  return (
    <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="grid gap-1">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('admin.editor.publishStatus.publishLabel')}
        </Label>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PublishBadge status={status} isFuture={isFuture} />
          <RevisionSummaryInline summary={revisionSummary} />
        </div>
      </div>
      <div className="grid gap-1 border-t border-border/60 pt-3">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('admin.editor.publishStatus.saveLabel')}
        </Label>
        <SaveStatusLine status={saveStatus} />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('admin.editor.publishStatus.publishedAt')}
        </Label>
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
            const d = new Date()
            d.setDate(d.getDate() + 1)
            d.setHours(9, 0, 0, 0)
            onChangePublishedAt(dateToLocalInputValue(d))
          }}
          disabled={disabled}
          className="grid-cols-2 gap-2"
        >
          <LabelledRadioCard
            id={`${fieldId}-now`}
            value="now"
            active={!isScheduled}
            label={t('admin.editor.publishStatus.publishNow')}
            description={t('admin.editor.publishStatus.publishNowDescription')}
          />
          <LabelledRadioCard
            id={`${fieldId}-scheduled`}
            value="scheduled"
            active={isScheduled}
            label={t('admin.editor.publishStatus.publishScheduled')}
            description={t('admin.editor.publishStatus.publishScheduledDescription')}
          />
        </RadioGroup>
        {isScheduled ? (
          <DateTimePicker id={`${fieldId}-at`} value={publishedAt} onChange={onChangePublishedAt} disabled={disabled} />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {isScheduled
            ? isFuture
              ? t('admin.editor.publishStatus.hintFuture')
              : t('admin.editor.publishStatus.hintPast')
            : t('admin.editor.publishStatus.hintImmediate')}
        </p>
      </div>
    </div>
  )
}

function RevisionSummaryInline({ summary }: { summary: SidebarRevisionSummary | null }) {
  const { t } = useI18n()
  if (summary === null || summary.kind === 'no-revision') {
    return <span className="text-xs text-muted-foreground">{t('admin.editor.publishStatus.noRevision')}</span>
  }
  return null
}

function PublishBadge({ status, isFuture }: { status: SidebarPublishStatus; isFuture: boolean }) {
  const { t } = useI18n()
  switch (status) {
    case 'never-saved':
      return (
        <Badge variant="outline" className="border-status-info-border bg-status-info-bg text-status-info-fg">
          <CircleDashedIcon /> {t('admin.editor.publishStatus.neverSaved')}
        </Badge>
      )
    case 'offline':
      return (
        <Badge variant="outline" className="border-status-error-border bg-status-error-bg text-status-error-fg">
          <EyeOffIcon /> {t('admin.editor.publishStatus.unpublished')}
        </Badge>
      )
    case 'scheduled':
      return (
        <Badge variant="outline" className="border-status-info-border bg-status-info-bg text-status-info-fg">
          <CalendarClockIcon /> {t('admin.editor.publishStatus.scheduled')}
        </Badge>
      )
    case 'live':
      void isFuture
      return (
        <Badge variant="outline" className="border-status-success-border bg-status-success-bg text-status-success-fg">
          <CheckCircle2Icon /> {t('admin.editor.publishStatus.published')}
        </Badge>
      )
    case 'live-with-draft-ahead':
      return (
        <Badge variant="outline" className="border-status-warn-border bg-status-warn-bg text-status-warn-fg">
          <CheckCircle2Icon /> {t('admin.editor.publishStatus.publishedWithDraft')}
        </Badge>
      )
  }
}

function SaveStatusLine({ status }: { status: SidebarSaveStatus }) {
  const { locale, t } = useI18n()
  const { timeZone } = useSiteIdentity()
  switch (status.kind) {
    case 'unsaved':
      return <span className="text-xs text-muted-foreground">{t('admin.editor.publishStatus.unsaved')}</span>
    case 'saving':
      return <span className="text-xs text-muted-foreground">{t('admin.editor.publishStatus.saving')}</span>
    case 'saved':
      return (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(new Date(status.atMs), { locale, timeZone })}
        </span>
      )
    case 'error':
      return <span className="text-xs text-destructive">{status.message}</span>
    case 'conflict':
      return <span className="text-xs text-destructive">{t('admin.editor.publishStatus.cloudAhead')}</span>
    case 'warning':
      return <span className="text-xs text-status-warn-fg">{status.message}</span>
    case 'info':
      return <span className="text-xs text-status-warn-fg">{status.message}</span>
  }
}
