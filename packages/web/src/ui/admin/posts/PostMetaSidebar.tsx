import type { AdminPostDto } from '@kobato/shared/contracts/posts.ts'
import type { PostMetaDraft } from '@kobato/shared/types/posts.ts'

import { POST_META_TOGGLE_FIELDS } from '@kobato/shared/types/posts.ts'
import { type ReactNode } from 'react'

import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '../editor-shell/editor-shell-types'

import { BasicInfoCard } from '../editor-shared/BasicInfoCard'
import { ContentLanguageField } from '../editor-shared/ContentLanguageField'
import { CoverOgCard } from '../editor-shared/CoverOgCard'
import { ToggleOptionsCard } from '../editor-shared/ToggleOptionsCard'
import { futureLocalInputValueOrEmpty } from '../editor-shell/editor-datetime'
import { AliasField } from './meta/AliasField'
import { CategoryField } from './meta/CategoryField'
import { TagsField } from './meta/TagsField'

export function metaDraftFromPost(post: AdminPostDto): PostMetaDraft {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    og: post.og ?? '',
    published: post.published,
    commentsEnabled: post.commentsEnabled,
    webmentionsEnabled: post.webmentionsEnabled,
    showToc: post.showToc,
    showUpdated: post.showUpdated,
    contentLanguage: post.contentLanguage ?? '',
    visible: post.visible,
    pinned: post.pinnedAt !== null,
    categoryId: post.categoryId ?? '',
    tags: post.tags,
    alias: post.alias,
    publishedAt: futureLocalInputValueOrEmpty(post.publishedAt),
  }
}

export interface MetaSidebarProps {
  draft: PostMetaDraft
  onChange: (next: PostMetaDraft) => void
  disabled?: boolean
  publishStatus?: SidebarPublishStatus | null
  ogPreviewSlug?: string | null
  revisionSummary?: SidebarRevisionSummary | null
  saveStatus: SidebarSaveStatus
  featureGate?: 'enabled' | 'disabled'
  extras?: ReactNode
}

export function PostMetaSidebar({
  draft,
  onChange,
  disabled,
  publishStatus,
  ogPreviewSlug,
  revisionSummary,
  saveStatus,
  featureGate,
  extras,
}: MetaSidebarProps) {
  const set = <K extends keyof PostMetaDraft>(key: K, value: PostMetaDraft[K]) => onChange({ ...draft, [key]: value })

  return (
    <div className="flex flex-col gap-4">
      <BasicInfoCard
        summaryId="post-summary"
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
          id="post-content-language"
          value={draft.contentLanguage}
          onChange={(value) => set('contentLanguage', value)}
          disabled={disabled}
        />
        <CategoryField value={draft.categoryId} onChange={(value) => set('categoryId', value)} disabled={disabled} />
        <TagsField values={draft.tags} onChange={(values) => set('tags', values)} disabled={disabled} />
        <AliasField values={draft.alias} onChange={(values) => set('alias', values)} disabled={disabled} />
      </BasicInfoCard>

      <CoverOgCard
        coverId="post-cover"
        ogId="post-og"
        entityLabelId="admin.editor.entity.post"
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
        fields={POST_META_TOGGLE_FIELDS}
        fieldVisible={(field) => field.featureGate !== 'featurePosts' || featureGate === 'enabled'}
        value={(key) => draft[key]}
        onToggle={(key, value) => set(key, value)}
        disabled={disabled}
      />
      {extras !== undefined ? extras : null}
    </div>
  )
}
