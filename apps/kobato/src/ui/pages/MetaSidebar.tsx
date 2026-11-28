import type { AdminPageDto } from '@kobato/api/contracts/admin/pages'

import { type ReactNode } from 'react'

import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/editor-shell/editor-shell-types'
import type { PageMetaDraft } from '@/ui/pages/page-meta'

import { BasicInfoCard } from '@/ui/editor-meta/BasicInfoCard'
import { ContentLanguageField } from '@/ui/editor-meta/ContentLanguageField'
import { CoverOgCard } from '@/ui/editor-meta/CoverOgCard'
import { ToggleOptionsCard } from '@/ui/editor-meta/ToggleOptionsCard'
import { futureLocalInputValueOrEmpty } from '@/ui/editor-shell/editor-datetime'
import { PAGE_META_TOGGLE_FIELDS } from '@/ui/pages/page-meta'

export function metaDraftFromPage(page: AdminPageDto): PageMetaDraft {
  return {
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    cover: page.cover,
    og: page.og ?? '',
    published: page.published,
    commentsEnabled: page.commentsEnabled,
    webmentionsEnabled: page.webmentionsEnabled,
    showToc: page.showToc,
    showUpdated: page.showUpdated,
    contentLanguage: page.contentLanguage ?? '',
    showFriends: page.showFriends,
    publishedAt: futureLocalInputValueOrEmpty(page.publishedAt),
  }
}

export interface MetaSidebarProps {
  draft: PageMetaDraft
  onChange: (next: PageMetaDraft) => void
  disabled?: boolean
  publishStatus?: SidebarPublishStatus | null
  ogPreviewSlug?: string | null
  revisionSummary?: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  extras?: ReactNode
}

export function MetaSidebar({
  draft,
  onChange,
  disabled,
  publishStatus,
  ogPreviewSlug,
  revisionSummary,
  saveStatus,
  extras,
}: MetaSidebarProps) {
  const set = <K extends keyof PageMetaDraft>(key: K, value: PageMetaDraft[K]) => onChange({ ...draft, [key]: value })

  return (
    <div className="flex flex-col gap-4">
      <BasicInfoCard
        summaryId="page-summary"
        summary={draft.summary}
        onSummaryChange={(value) => set('summary', value)}
        publishStatus={publishStatus}
        revisionSummary={revisionSummary}
        saveStatus={saveStatus}
        publishedAt={draft.publishedAt}
        onChangePublishedAt={(value) => set('publishedAt', value)}
        disabled={disabled}
      >
        <ContentLanguageField
          id="page-content-language"
          value={draft.contentLanguage}
          onChange={(value) => set('contentLanguage', value)}
          disabled={disabled}
        />
      </BasicInfoCard>

      <CoverOgCard
        coverId="page-cover"
        ogId="page-og"
        entityLabelId="admin.editor.entity.page"
        cover={draft.cover}
        onCoverChange={(value) => set('cover', value)}
        og={draft.og}
        onOgChange={(value) => set('og', value)}
        title={draft.title}
        summary={draft.summary}
        ogPreviewSlug={ogPreviewSlug}
        disabled={disabled}
      />

      <ToggleOptionsCard
        fields={PAGE_META_TOGGLE_FIELDS}
        value={(key) => draft[key]}
        onToggle={(key, value) => set(key, value)}
        disabled={disabled}
      />
      {extras !== undefined ? extras : null}
    </div>
  )
}
