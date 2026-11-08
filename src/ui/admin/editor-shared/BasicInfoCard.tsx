import type { ReactNode } from 'react'

import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { PublishStatusRow } from '@/ui/admin/editor-shared/PublishStatusRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface BasicInfoCardProps {
  /** `<Textarea>` id + label htmlFor (`post-summary` / `page-summary`). */
  summaryId: string
  summary: string
  onSummaryChange: (value: string) => void
  publishStatus?: SidebarPublishStatus | null
  revisionSummary?: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  publishedAt: string
  onChangePublishedAt: (value: string) => void
  disabled?: boolean
  /** Entity-specific fields rendered below the summary (post: category / tags / alias). */
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
