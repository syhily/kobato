import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-types'
import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card'
import { Label } from '@kobato/ui/components/label'
import { Textarea } from '@kobato/ui/components/textarea'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { PublishStatusRow } from '@kobato/web-admin/ui/editor-meta/PublishStatusRow'

export interface BasicInfoCardProps {
  summaryId: string
  summary: string
  onSummaryChange: (value: string) => void
  publishStatus?: SidebarPublishStatus | null
  revisionSummary?: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  publishedAt: string
  onChangePublishedAt: (value: string) => void
  disabled?: boolean
  children?: ReactNode
}

export function BasicInfoCard({
  summaryId,
  summary,
  onSummaryChange,
  publishStatus,
  revisionSummary,
  saveStatus,
  publishedAt,
  onChangePublishedAt,
  disabled,
  children,
}: BasicInfoCardProps) {
  const { t } = useI18n()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.editor.basicInfo')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PublishStatusRow
          status={publishStatus ?? 'never-saved'}
          revisionSummary={revisionSummary ?? null}
          saveStatus={saveStatus}
          publishedAt={publishedAt}
          onChangePublishedAt={onChangePublishedAt}
          disabled={disabled}
        />
        <div className="grid gap-2">
          <Label htmlFor={summaryId}>{t('admin.editor.summary')}</Label>
          <Textarea
            id={summaryId}
            value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={disabled}
            placeholder={t('admin.editor.summaryPlaceholder')}
          />
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
