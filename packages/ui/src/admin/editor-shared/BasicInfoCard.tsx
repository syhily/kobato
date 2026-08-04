import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@kobato/ui/admin/editor-shell/editor-shell-types'
import type { ReactNode } from 'react'

import { PublishStatusRow } from '@kobato/ui/admin/editor-shared/PublishStatusRow'
import { Card, CardContent, CardHeader, CardTitle } from '@kobato/ui/components/card'
import { Label } from '@kobato/ui/components/label'
import { Textarea } from '@kobato/ui/components/textarea'

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">基本信息</CardTitle>
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
          <Label htmlFor={summaryId}>摘要</Label>
          <Textarea
            id={summaryId}
            value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={disabled}
            placeholder="可选，用于列表与社交分享卡片。"
          />
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
