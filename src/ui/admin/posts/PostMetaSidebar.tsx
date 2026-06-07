import { type ReactNode } from 'react'

import type { AdminPostDto } from '@/shared/types/posts'

import { POST_META_TOGGLE_FIELDS } from '@/shared/types/posts'
import { GeneratedOgPreview, ImageField } from '@/ui/admin/editor-shared/ImageField'
import { PublishStatusRow } from '@/ui/admin/editor-shared/PublishStatusRow'
import { ToggleRow } from '@/ui/admin/editor-shared/ToggleRow'
import { AliasField } from '@/ui/admin/posts/meta/AliasField'
import { CategoryField } from '@/ui/admin/posts/meta/CategoryField'
import { TagsField } from '@/ui/admin/posts/meta/TagsField'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'

export interface PostMetaDraft {
  slug: string
  title: string
  summary: string
  cover: string
  og: string
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  showUpdated: boolean
  visible: boolean
  pinned: boolean
  category: string
  tags: string[]
  alias: string[]
  publishedAt: string
}

export const EMPTY_POST_META_DRAFT: PostMetaDraft = {
  slug: '',
  title: '',
  summary: '',
  cover: '',
  og: '',
  published: false,
  commentsEnabled: true,
  showToc: false,
  showUpdated: false,
  visible: true,
  pinned: false,
  category: '',
  tags: [],
  alias: [],
  publishedAt: '',
}

export function metaDraftsEqual(a: PostMetaDraft, b: PostMetaDraft): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.summary === b.summary &&
    a.cover === b.cover &&
    a.og === b.og &&
    a.published === b.published &&
    a.commentsEnabled === b.commentsEnabled &&
    a.showToc === b.showToc &&
    a.showUpdated === b.showUpdated &&
    a.visible === b.visible &&
    a.pinned === b.pinned &&
    a.category === b.category &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    JSON.stringify(a.alias) === JSON.stringify(b.alias) &&
    a.publishedAt === b.publishedAt
  )
}

export function metaDraftFromPost(post: AdminPostDto): PostMetaDraft {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    og: post.og ?? '',
    published: post.published,
    commentsEnabled: post.commentsEnabled,
    showToc: post.showToc,
    showUpdated: post.showUpdated,
    visible: post.visible,
    pinned: post.pinnedAt !== null,
    category: post.category,
    tags: post.tags,
    alias: post.alias,
    publishedAt: futureLocalInputValueOrEmpty(post.publishedAt),
  }
}

function futureLocalInputValueOrEmpty(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms) || ms <= Date.now()) {
    return ''
  }
  return isoToLocalInputValue(iso)
}

function isoToLocalInputValue(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return ''
  }
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputValueToIso(value: string): string | null {
  if (value.trim() === '') {
    return null
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

import type {
  SidebarPublishStatus,
  SidebarRevisionSummary,
  SidebarSaveStatus,
} from '@/ui/admin/editor-shared/sidebar-types'

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PublishStatusRow
            status={publishStatus ?? 'never-saved'}
            revisionSummary={revisionSummary ?? null}
            saveStatus={saveStatus}
            publishedAt={draft.publishedAt}
            onChangePublishedAt={(value) => set('publishedAt', value)}
            disabled={disabled}
          />
          <div className="grid gap-2">
            <Label htmlFor="post-summary">摘要</Label>
            <Textarea
              id="post-summary"
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value)}
              rows={3}
              maxLength={500}
              disabled={disabled}
              placeholder="可选，用于列表与社交分享卡片。"
            />
          </div>
          <CategoryField value={draft.category} onChange={(value) => set('category', value)} disabled={disabled} />
          <TagsField values={draft.tags} onChange={(values) => set('tags', values)} disabled={disabled} />
          <AliasField values={draft.alias} onChange={(values) => set('alias', values)} disabled={disabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">封面 / OG 图</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            两项均为可选。封面用于列表与文章顶部展示；OG 图供社交平台分享卡片使用，留空则回退到默认生成的 OG 卡片。
          </p>
          <ImageField
            id="post-cover"
            label="封面图"
            value={draft.cover}
            onChange={(value) => set('cover', value)}
            disabled={disabled}
            aspect="aspect-[16/9]"
            urlPlaceholder="https://… 或从图片库挑选"
            emptyHint="点击此处上传封面，或粘贴一张图片 URL。"
          />
          <ImageField
            id="post-og"
            label="OG 图"
            value={draft.og}
            onChange={(value) => set('og', value)}
            disabled={disabled}
            aspect="aspect-[1200/630]"
            urlPlaceholder="留空则使用默认生成的 OG"
            emptyContent={
              ogPreviewSlug !== null && ogPreviewSlug !== undefined && ogPreviewSlug !== '' ? (
                <GeneratedOgPreview
                  slug={ogPreviewSlug}
                  cover={draft.cover}
                  title={draft.title}
                  summary={draft.summary}
                />
              ) : undefined
            }
            emptyHint={
              ogPreviewSlug !== null && ogPreviewSlug !== undefined && ogPreviewSlug !== ''
                ? '当前展示的是默认生成的 OG。点击图片可上传一张专属 OG 覆盖。'
                : '文章首次保存后，这里会展示默认生成的 OG 预览。也可现在点击上传一张专属 OG。'
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">展示选项</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {POST_META_TOGGLE_FIELDS.filter(
            (field) => field.featureGate !== 'featurePosts' || featureGate === 'enabled',
          ).map((field) => (
            <ToggleRow
              key={field.key}
              id={field.id}
              label={field.label}
              description={field.description}
              checked={draft[field.key]}
              onCheckedChange={(value) => set(field.key, value)}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>
      {extras !== undefined ? extras : null}
    </div>
  )
}
