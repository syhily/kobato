import { type ReactNode } from 'react'

import type { AdminPageDto } from '@/shared/contracts/pages'
import type { PageMetaDraft } from '@/shared/types/pages'
import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shell/editor-shell-types'

import { PAGE_META_TOGGLE_FIELDS } from '@/shared/types/pages'
import { BasicInfoCard } from '@/ui/admin/editor-shared/BasicInfoCard'
import { CoverOgCard } from '@/ui/admin/editor-shared/CoverOgCard'
import { ToggleOptionsCard } from '@/ui/admin/editor-shared/ToggleOptionsCard'
import { futureLocalInputValueOrEmpty } from '@/ui/admin/editor-shell/editor-datetime'

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
    showFriends: page.showFriends,
    publishedAt: futureLocalInputValueOrEmpty(page.publishedAt),
  }
}

export interface MetaSidebarProps {
  draft: PageMetaDraft
  onChange: (next: PageMetaDraft) => void
  /** Disable every input while a save / publish is in flight. */
  disabled?: boolean
  /** Lifecycle status for the 基本信息 badge; `null` falls back to `never-saved`. */
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
      />

      <CoverOgCard
        coverId="page-cover"
        ogId="page-og"
        entityLabel="页面"
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
