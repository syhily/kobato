import type { NavigateFunction } from 'react-router'

import { describe, expect, it } from 'vitest'

import { makeAdminPost } from '#/_helpers/catalog'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EMPTY_POST_META_DRAFT, postMetaDraftsEqual, type PostMetaDraft } from '@/shared/types/posts'
import { localInputValueToIso } from '@/ui/admin/editor-shell/editor-datetime'
import { EditorMetaPanel } from '@/ui/admin/editor-shell/EditorMetaPanel'
import { metaDraftFromPost, PostMetaSidebar } from '@/ui/admin/posts/PostMetaSidebar'

// PostMetaSidebar is props-driven (no fetching) — SSR renders populated and
// empty branches by swapping the draft. PostEditorShell is skipped (TipTap
// is browser-only); MetaPanel wrappers use a stubbed editor-shell state.

const noop = () => undefined

const populatedDraft: PostMetaDraft = {
  slug: 'hello-world',
  title: 'Hello World',
  summary: 'A populated summary for the post.',
  cover: '/images/cover.png',
  og: '/images/og.png',
  published: true,
  commentsEnabled: true,
  webmentionsEnabled: true,
  showToc: true,
  showUpdated: false,
  visible: true,
  pinned: true,
  categoryId: '1',
  tags: ['react', 'ssr'],
  alias: ['/old-slug'],
  publishedAt: '2099-01-01T09:00',
}

describe('snapshot: PostMetaSidebar', () => {
  it('renders the populated draft with summary, cover and toggles', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={populatedDraft}
          onChange={noop}
          saveStatus={{ kind: 'unsaved' }}
          featureGate="enabled"
        />,
      ),
    )
    expect(html).toContain('基本信息')
    expect(html).toContain('A populated summary for the post.')
    expect(html).toContain('封面 / OG 图')
    expect(html).toContain('/images/cover.png')
    expect(html).toContain('/images/og.png')
    expect(html).toContain('展示选项')
    expect(html).toContain('开启评论')
    expect(html).toContain('显示目录')
    expect(html).toContain('显示修改时间')
    expect(html).toContain('文章可见')
    // Pinned toggle only renders when featureGate is enabled.
    expect(html).toContain('置顶到首页')
  })

  it('hides the pinned toggle when featureGate is disabled', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={{ ...populatedDraft, pinned: false }}
          onChange={noop}
          saveStatus={{ kind: 'unsaved' }}
          featureGate="disabled"
        />,
      ),
    )
    expect(html).not.toContain('置顶到首页')
    expect(html).toContain('开启评论')
    expect(html).toContain('显示目录')
  })

  it('renders the empty draft (never-saved) state', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={EMPTY_POST_META_DRAFT}
          onChange={noop}
          publishStatus="never-saved"
          revisionSummary={null}
          saveStatus={{ kind: 'unsaved' }}
        />,
      ),
    )
    expect(html).toContain('尚未保存')
    expect(html).toContain('未保存')
    // No cover value => the empty hint copy shows.
    expect(html).toContain('点击此处上传封面，或粘贴一张图片 URL。')
    expect(html).toContain('摘要')
  })

  it('renders the scheduled publish branch with a future publishedAt', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={{ ...populatedDraft, publishedAt: '2099-06-01T09:00' }}
          onChange={noop}
          publishStatus="scheduled"
          revisionSummary={null}
          saveStatus={{ kind: 'saved', atMs: 1_700_000_000_000 }}
        />,
      ),
    )
    expect(html).toContain('已计划发布')
    // DateTimePicker renders the chosen instant as a localized string.
    expect(html).toContain('2099年6月1日')
    // Saved-at hint from the saveStatus.
    expect(html).toMatch(/2023年\d+月\d+日/u)
  })

  it('renders the live-with-draft-ahead status and revision summary', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={populatedDraft}
          onChange={noop}
          publishStatus="live-with-draft-ahead"
          revisionSummary={{ kind: 'draft-ahead', draftRevisionNo: 5, publishedRevisionNo: 4 }}
          saveStatus={{ kind: 'saving' }}
          ogPreviewSlug="hello-world"
        />,
      ),
    )
    expect(html).toContain('已发布（有未发布草稿）')
    expect(html).toContain('保存中…')
  })

  it('renders the offline (unpublished) status', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={populatedDraft}
          onChange={noop}
          publishStatus="offline"
          revisionSummary={null}
          saveStatus={{ kind: 'error', message: '网络错误' }}
        />,
      ),
    )
    expect(html).toContain('已取消发布')
    expect(html).toContain('网络错误')
  })

  it('renders the generated OG preview when ogPreviewSlug is set and og is empty', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={{ ...populatedDraft, og: '' }}
          onChange={noop}
          saveStatus={{ kind: 'unsaved' }}
          ogPreviewSlug="hello-world"
        />,
      ),
    )
    // Empty og → GeneratedOgPreview pointing at the slug.
    expect(html).toContain('当前展示的是默认生成的 OG')
    expect(html).toContain('hello-world')
  })

  it('renders the error / conflict save-status branches', () => {
    const html = stableHtml(
      renderToHtml(<PostMetaSidebar draft={populatedDraft} onChange={noop} saveStatus={{ kind: 'conflict' }} />),
    )
    expect(html).toContain('检测到云端有更新的修订，请刷新后再保存。')
  })

  it('renders the info save-status branch', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={populatedDraft}
          onChange={noop}
          saveStatus={{ kind: 'info', message: '自动保存已暂停' }}
        />,
      ),
    )
    expect(html).toContain('自动保存已暂停')
  })

  it('renders extras slot when provided', () => {
    const html = stableHtml(
      renderToHtml(
        <PostMetaSidebar
          draft={populatedDraft}
          onChange={noop}
          saveStatus={{ kind: 'unsaved' }}
          extras={<div data-test="extras">extras-slot</div>}
        />,
      ),
    )
    expect(html).toContain('extras-slot')
  })
})

describe('snapshot: PostMetaDraft pure helpers', () => {
  it('metaDraftFromPost maps an AdminPostDto onto a draft (pinned from pinnedAt)', () => {
    const post = makeAdminPost({ pinnedAt: '2024-05-01T00:00:00.000Z', tags: ['a', 'b'] })
    const draft = metaDraftFromPost(post)
    expect(draft.slug).toBe(post.slug)
    expect(draft.pinned).toBe(true)
    expect(draft.tags).toEqual(['a', 'b'])
    // Past publishedAt → cleared (future ones stay as local input values).
    expect(draft.publishedAt).toBe('')
  })

  it('metaDraftFromPost keeps a future publishedAt as a local input value', () => {
    const post = makeAdminPost({ publishedAt: '2099-12-31T10:00:00.000Z' })
    const draft = metaDraftFromPost(post)
    // ISO → local datetime-local value; assert shape, not a timezone-pinned string.
    expect(draft.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u)
    expect(Date.parse(localInputValueToIso(draft.publishedAt)!)).toBe(Date.parse(post.publishedAt))
  })

  it('postMetaDraftsEqual returns true for identical drafts and false for any diff', () => {
    // Build two drafts from the same source so generated ids/slugs match.
    const source = makeAdminPost({ slug: 'fixed-slug', tags: ['a'] })
    const a = metaDraftFromPost(source)
    const b = metaDraftFromPost(source)
    expect(postMetaDraftsEqual(a, b)).toBe(true)
    expect(postMetaDraftsEqual(a, { ...a, title: 'changed' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, tags: ['x'] })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, alias: ['/x'] })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, published: !a.published })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, visible: !a.visible })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, pinned: !a.pinned })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, summary: 'diff' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, cover: 'diff' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, og: 'diff' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, categoryId: 'diff' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, commentsEnabled: !a.commentsEnabled })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, webmentionsEnabled: !a.webmentionsEnabled })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, showToc: !a.showToc })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, showUpdated: !a.showUpdated })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, slug: 'diff' })).toBe(false)
    expect(postMetaDraftsEqual(a, { ...a, publishedAt: '2099-01-01T00:00' })).toBe(false)
  })

  it('localInputValueToIso round-trips a local input value and rejects garbage', () => {
    expect(localInputValueToIso('')).toBeNull()
    expect(localInputValueToIso('   ')).toBeNull()
    expect(localInputValueToIso('not-a-date')).toBeNull()
    const iso = localInputValueToIso('2099-01-02T03:04')
    expect(iso).not.toBeNull()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u)
    const backToLocal = new Date(iso!).getTime()
    expect(Number.isFinite(backToLocal)).toBe(true)
  })
})

// Minimal stubs satisfy the panel props — the full editor state machine
// (TipTap + draft sync) isn't needed.

const sidebarState = {
  draft: populatedDraft,
  onChange: noop,
  disabled: false,
  publishStatus: 'live' as const,
  revisionSummary: null,
  saveStatus: { kind: 'unsaved' as const },
  expectedToken: 'token-abc',
  body: [],
  adoptRevisionFromHistory: noop,
}

const deleteRestore = {
  listPath: '/admin/posts',
  deleteFn: async () => undefined,
  restoreFn: async () => undefined,
  invalidateList: noop,
  navigate: (() => undefined) as unknown as NavigateFunction,
}

function renderMetaPanel(entity: { id: string; slug: string; title: string; deletedAt: string | null } | undefined) {
  return stableHtml(
    renderInRouter(
      <EditorMetaPanel
        entityKind="post"
        entityLabel="文章"
        entity={entity}
        previewOpen={false}
        metaOpen={true}
        setMetaOpen={noop}
        isLg={true}
        sidebar={sidebarState}
        renderSidebar={(props) => <PostMetaSidebar {...props} />}
        deleteRestore={deleteRestore}
      />,
      '/editor/post/1',
    ),
  )
}

describe('snapshot: EditorMetaPanel (aside)', () => {
  it('renders the sidebar (lg aside) with revision + delete extras for an existing post', () => {
    const post = makeAdminPost({ title: 'Editable Post' })
    const html = renderMetaPanel({ id: post.id, slug: post.slug, title: post.title, deletedAt: post.deletedAt })
    expect(html).toContain('基本信息')
    // Extras renders the revision-history trigger + delete button (edit mode).
    expect(html).toContain('历史版本')
    expect(html).toContain('删除文章')
  })

  it('renders the restore button when the post is soft-deleted', () => {
    const post = makeAdminPost({ deletedAt: '2024-03-01T00:00:00.000Z' })
    const html = renderMetaPanel({ id: post.id, slug: post.slug, title: post.title, deletedAt: post.deletedAt })
    expect(html).toContain('恢复文章')
    expect(html).not.toContain('删除文章')
  })

  it('omits the extras block in create mode (no entity)', () => {
    const html = renderMetaPanel(undefined)
    expect(html).toContain('基本信息')
    expect(html).not.toContain('历史版本')
    expect(html).not.toContain('删除文章')
  })
})

describe('snapshot: EditorMetaPanel (sheet)', () => {
  it('renders the sheet wrapper (closed state emits no panel body on SSR)', () => {
    const post = makeAdminPost({ title: 'Sheet Post' })
    // Closed Sheet portal emits nothing under SSR — the component still mounts without throwing.
    const html = stableHtml(
      renderInRouter(
        <EditorMetaPanel
          entityKind="post"
          entityLabel="文章"
          entity={{ id: post.id, slug: post.slug, title: post.title, deletedAt: post.deletedAt }}
          previewOpen={true}
          metaOpen={false}
          setMetaOpen={noop}
          isLg={true}
          sidebar={sidebarState}
          renderSidebar={(props) => <PostMetaSidebar {...props} />}
          deleteRestore={deleteRestore}
        />,
        '/editor/post/1',
      ),
    )
    // Closed portals emit nothing — assert only that the render doesn't throw.
    expect(html).toBe('')
  })
})
