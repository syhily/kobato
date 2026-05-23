import { type ReactNode } from 'react'

import type { AdminPostDto } from '@/shared/types/posts'

import { POST_META_TOGGLE_FIELDS } from '@/shared/types/posts'
import { AliasField } from '@/ui/admin/posts/meta/AliasField'
import { CategoryField } from '@/ui/admin/posts/meta/CategoryField'
import { GeneratedOgPreview, ImageField } from '@/ui/admin/posts/meta/ImageField'
import { PublishStatusRow } from '@/ui/admin/posts/meta/PublishStatusRow'
import { TagsField } from '@/ui/admin/posts/meta/TagsField'
import { ToggleRow } from '@/ui/admin/posts/meta/ToggleRow'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { Label } from '@/ui/components/label'
import { Textarea } from '@/ui/components/textarea'

// --- Meta draft types ------------------------------------------------------

// Editable subset of `AdminPostDto`. The body is owned by the editor
// pane separately, so this state is purely metadata.
export interface PostMetaDraft {
  slug: string
  title: string
  summary: string
  cover: string
  og: string
  published: boolean
  commentsEnabled: boolean
  showToc: boolean
  /**
   * Opt the post into the「修改于 XXXX」secondary timestamp on the
   * public detail page. Defaults `false` so most posts stay single-date.
   */
  showUpdated: boolean
  visible: boolean
  pinned: boolean
  category: string
  tags: string[]
  alias: string[]
  /**
   * `<input type="datetime-local">` value (no timezone). Kept as a
   * raw string so the sidebar doesn't have to round-trip through the
   * Date constructor on every keystroke. Empty string ⇒ "leave the
   * current `publishedAt` alone on save".
   */
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
    // The picker treats the non-empty datetime-local string as "the
    // operator has opted into 定时发布 mode". For an already-published
    // post sitting in the past, leaving the string non-empty would
    // misleadingly start the editor in "schedule mode" with a past
    // time. Default-blank the field when the stored timestamp is at
    // or before "now" so the sidebar opens in 立即发布 mode (matching
    // the wire convention: empty ⇒ omit on publish ⇒ server stamps
    // `now()`). Future timestamps surface verbatim so the operator
    // can edit / cancel a pending schedule.
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

// --- Sidebar projection types ----------------------------------------------

/**
 * Revision-side projection of where the post sits in its versioning
 * lifecycle. Built by the editor shell from `detail.latestRevision` /
 * `detail.publishedRevision` and threaded into the sidebar so the
 * 发布状态 card can surface 「当前还没有保存的版本」 when applicable,
 * without the sidebar reaching back into server DTOs. Independent of
 * `SidebarPublishStatus` — that one tracks visibility (offline /
 * scheduled / live), this one tracks the draft↔published version
 * relationship.
 */
export type SidebarRevisionSummary =
  | { kind: 'no-revision' }
  // Latest committed revision *is* the currently-promoted one — no
  // newer draft sitting on top.
  | { kind: 'published-current'; revisionNo: number }
  // A draft revision is ahead of the (possibly missing) published
  // revision. Carried for shell-side derivations; not shown inline.
  | { kind: 'draft-ahead'; draftRevisionNo: number; publishedRevisionNo: number | null }

/** Right-rail save-state line — derived in `PostEditorShell`, rendered under 发布状态. */
export type SidebarSaveStatus =
  | { kind: 'unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; atMs: number }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' }
  | { kind: 'info'; message: string }

// High-level "where is this post in its lifecycle?" used to render
// the badge inside the 基本信息 card. The shell derives the value
// from server state + `meta.published` + `meta.publishedAt` and
// hands it in; the sidebar stays free of any business logic.
export type SidebarPublishStatus =
  // No revisions exist yet (create mode or a post that's never been
  // saved to the server).
  | 'never-saved'
  // Latest revision exists but the post is offline (`published =
  // false`). May or may not have been live in the past.
  | 'offline'
  // `published = true` and `publishedAt > now()`. The catalog
  // hides the post until the timestamp arrives.
  | 'scheduled'
  // `published = true` and `publishedAt <= now()` and the latest
  // revision has been promoted.
  | 'live'
  // `published = true` and `publishedAt <= now()` but the latest
  // revision is a draft sitting on top of an older published row.
  | 'live-with-draft-ahead'

export interface MetaSidebarProps {
  draft: PostMetaDraft
  onChange: (next: PostMetaDraft) => void
  /** Disable every input while a save / publish is in flight. */
  disabled?: boolean
  /**
   * Lifecycle status used to render the badge inside 基本信息.
   * `null` means the sidebar is being rendered in a context that
   * doesn't have a clear publish state (create mode before first
   * save), and the badge falls back to `never-saved`.
   */
  publishStatus?: SidebarPublishStatus | null
  /**
   * Persisted slug of the post being edited, used to render the
   * generated `/images/og/:slug.png` preview when the OG override is
   * empty. We deliberately read the *server-side* slug rather than
   * `draft.slug` so the preview keeps pointing at a working URL even
   * while the operator is mid-typing a new slug — the preview tile
   * would 404 on every keystroke otherwise. `null` (create mode or
   * before first save) collapses the OG empty-state into a static
   * placeholder explaining "save first to preview".
   */
  ogPreviewSlug?: string | null
  /**
   * Revision-versioning summary rendered alongside the visibility
   * badge inside 发布状态. `null` or `no-revision` renders as
   * 「当前还没有保存的版本」 inline; other kinds omit extra copy (the
   * badge already reflects draft vs live). The shell owns
   * the projection because it has direct access to
   * `detail.latestRevision` / `publishedRevision`; the sidebar is
   * pure-props.
   */
  revisionSummary?: SidebarRevisionSummary | null
  /** Shell-derived draft / persist lifecycle for the 保存状态 row under 发布状态. */
  saveStatus: SidebarSaveStatus
  /**
   * Whether the feature-post (pinning) toggle is shown in the sidebar.
   * Driven by the `blog.content` `post.featureEnabled` setting.
   */
  featureGate?: 'enabled' | 'disabled'
  /**
   * Optional extra slot rendered at the bottom of the panel. Used by
   * the editor shell to mount the revision history drawer trigger
   * once a post has been saved (creating mode renders nothing).
   */
  extras?: ReactNode
}

// --- Main component --------------------------------------------------------

// Right-pane metadata panel for the post editor. Lives in its own
// component so the editor route can swap the right pane between this
// (default) and a live preview without re-mounting the editor.
//
// Sub-components (ImageField, PublishStatusRow, CategoryField, TagsField,
// AliasField, ToggleRow, GeneratedOgPreview) live as siblings under
// `posts/meta/`. The split keeps each card self-contained while this
// entry file stays under 300 LOC of pure orchestration + types.
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
