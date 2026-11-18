import type { AdminPageDto } from '@kobato/contracts/pages.ts'
import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@kobato/web-admin/ui/editor-shell/editor-shell-types.ts'
import type { PageMetaDraft } from '@kobato/web-admin/ui/pages/page-meta.ts'

import { BasicInfoCard } from '@kobato/web-admin/ui/editor-shared/BasicInfoCard.tsx'
import { ContentLanguageField } from '@kobato/web-admin/ui/editor-shared/ContentLanguageField.tsx'
import { CoverOgCard } from '@kobato/web-admin/ui/editor-shared/CoverOgCard.tsx'
import { ToggleOptionsCard } from '@kobato/web-admin/ui/editor-shared/ToggleOptionsCard.tsx'
import { futureLocalInputValueOrEmpty } from '@kobato/web-admin/ui/editor-shell/editor-datetime.ts'
import { PAGE_META_TOGGLE_FIELDS } from '@kobato/web-admin/ui/pages/page-meta.ts'
import { type ReactNode } from 'react'

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
  /** Disable every input while a save / publish is in flight. */
  disabled?: boolean
  /** Lifecycle status for the basic-info badge; `null` falls back to `never-saved`. */
  publishStatus?: SidebarPublishStatus | null
  /** Persisted (server-side) slug for the `/images/og/:slug.png` preview — reads
   *  `page.slug`, not `draft.slug`, so the preview stays live while typing. */
  ogPreviewSlug?: string | null
  /** Revision-versioning summary for the visibility badge; `null` / `no-revision` renders as "no saved version yet". */
  revisionSummary?: SidebarRevisionSummary | null
  /** Shell-derived draft / persist lifecycle for the save-status row. */
  saveStatus: SidebarSaveStatus
  /** Extra slot at the bottom of the panel (revision history drawer trigger). */
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
