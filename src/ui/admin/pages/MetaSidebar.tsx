import { type ReactNode } from 'react'

import type { AdminPageDto, PageMetaDraft } from '@/shared/types/pages'

import { EMPTY_PAGE_META_DRAFT, PAGE_META_TOGGLE_FIELDS, pageMetaDraftsEqual } from '@/shared/types/pages'
import { GeneratedOgPreview, ImageField } from '@/ui/admin/pages/meta/ImageField'
import { PublishStatusRow } from '@/ui/admin/pages/meta/PublishStatusRow'
import { ToggleRow } from '@/ui/admin/pages/meta/ToggleRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'

export type { PageMetaDraft } from '@/shared/types/pages'
export const EMPTY_META_DRAFT = EMPTY_PAGE_META_DRAFT
export const metaDraftsEqual = pageMetaDraftsEqual

export function metaDraftFromPage(page: AdminPageDto): PageMetaDraft {
  return {
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    cover: page.cover,
    og: page.og ?? '',
    published: page.published,
    commentsEnabled: page.commentsEnabled,
    showToc: page.showToc,
    showUpdated: page.showUpdated,
    showFriends: page.showFriends,
    publishedAt: futureLocalInputValueOrEmpty(page.publishedAt),
  }
}

function futureLocalInputValueOrEmpty(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms) || ms <= Date.now()) {
    return ''
  }
  return isoToLocalInputValue(iso)
}

/**
 * Convert an ISO-8601 wire DTO timestamp into the `YYYY-MM-DDTHH:mm`
 * shape that `<input type="datetime-local">` expects. Returns `''`
 * for invalid inputs so the picker just renders blank.
 */
function isoToLocalInputValue(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    return ''
  }
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Inverse of `isoToLocalInputValue`. Returns `null` for empty input
 * so the caller can omit `publishedAt` from the save payload (server
 * preserves the existing value in that case).
 */
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

export type SidebarRevisionSummary =
  | { kind: 'no-revision' }
  | { kind: 'published-current'; revisionNo: number }
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }

/** Right-rail save-state line — derived in `PageEditorShell`, rendered under 发布状态. */
export type SidebarSaveStatus =
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; atMs: number }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' }
  | { kind: 'info'; message: string }

export type SidebarPublishStatus = 'never-saved' | 'offline' | 'scheduled' | 'live' | 'live-with-draft-ahead'

export interface MetaSidebarProps {
  draft: PageMetaDraft
  onChange: (next: PageMetaDraft) => void
  /** Disable every input while a save / publish is in flight. */
  disabled?: boolean
  /**
   * Lifecycle status used to render the badge inside 基本信息. `null`
   * means the sidebar is being rendered in a context that doesn't
   * have a clear publish state, and the badge falls back to
   * `never-saved`.
   */
  publishStatus?: SidebarPublishStatus | null
  /**
   * Persisted slug of the page being edited, used to render the
   * generated `/images/og/:slug.png` preview when the OG override is
   * empty. We read the *server-side* slug rather than `draft.slug` so
   * the preview keeps pointing at a working URL while the operator
   * is mid-typing.
   */
  ogPreviewSlug?: string | null
  /**
   * Revision-versioning summary rendered alongside the visibility
   * badge. `null` or `no-revision` renders as 「当前还没有保存的版本」
   * inline.
   */
  revisionSummary?: SidebarRevisionSummary | null
  /** Shell-derived draft / persist lifecycle for the 保存状态 row. */
  saveStatus: SidebarSaveStatus
  /**
   * Optional extra slot rendered at the bottom of the panel. Used by
   * the editor shell to mount the revision history drawer trigger.
   */
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
            <Label htmlFor="page-summary">摘要</Label>
            <Textarea
              id="page-summary"
              value={draft.summary}
              onChange={(e) => set('summary', e.target.value)}
              rows={3}
              maxLength={500}
              disabled={disabled}
              placeholder="可选，用于列表与社交分享卡片。"
            />
          </div>
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
            id="page-cover"
            label="封面图"
            value={draft.cover}
            onChange={(value) => set('cover', value)}
            disabled={disabled}
            aspect="aspect-[16/9]"
            urlPlaceholder="https://… 或从图片库挑选"
            emptyHint="点击此处上传封面，或粘贴一张图片 URL。"
          />
          <ImageField
            id="page-og"
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
                : '页面首次保存后，这里会展示默认生成的 OG 预览。也可现在点击上传一张专属 OG。'
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">展示选项</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {PAGE_META_TOGGLE_FIELDS.map((field) => (
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
