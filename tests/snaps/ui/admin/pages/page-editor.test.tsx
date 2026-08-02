import { describe, expect, it, vi } from 'vitest'

import type { AdminPageDetailDto } from '@/shared/contracts/pages'
import type { PageMetaDraft } from '@/shared/types/pages'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { MetaSidebar } from '@/ui/admin/pages/MetaSidebar'
import { PageEditorRoute } from '@/ui/admin/pages/PageEditorRoute'
import { PageEditorShell } from '@/ui/admin/pages/PageEditorShell'

vi.mock('@/ui/admin/editor/PageBodyEditor', () => ({
  PageBodyEditor: () => <div data-testid="page-body-editor">PageBodyEditor</div>,
}))

vi.mock('@/ui/admin/shell/AdminShell', () => ({
  useAdminChrome: () => ({
    setFocused: () => {},
    setScrollTopLifted: () => {},
  }),
  useAdminChromeFocus: () => {},
  useAdminScrollTopLift: () => {},
}))

function makePageDetail(overrides: Partial<AdminPageDetailDto> = {}): AdminPageDetailDto {
  const page = overrides.page ?? {
    id: '1',
    slug: 'hello',
    title: 'Hello Page',
    summary: 'Summary',
    cover: '/images/cover.png',
    og: null,
    published: true,
    commentsEnabled: true,
    webmentionsEnabled: true,
    showToc: false,
    showUpdated: false,
    showFriends: false,
    publishedAt: '2024-01-01T00:00:00.000Z',
    publishedRevisionId: 'rev-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    deletedAt: null,
    authorId: null,
    authorName: 'Author',
    commentCount: 0,
    commentPublicId: 'comment-1',
  }
  return {
    page,
    latestRevision: overrides.latestRevision ?? null,
    publishedRevision: overrides.publishedRevision ?? null,
  }
}

const EMPTY_META_DRAFT: PageMetaDraft = {
  slug: '',
  title: '',
  summary: '',
  cover: '',
  og: '',
  published: false,
  commentsEnabled: true,
  webmentionsEnabled: true,
  showToc: false,
  showUpdated: false,
  showFriends: false,
  publishedAt: '',
}

describe('snapshot: MetaSidebar', () => {
  it('renders sidebar fields', () => {
    const html = stableHtml(
      renderToHtml(
        <MetaSidebar
          draft={EMPTY_META_DRAFT}
          onChange={() => {}}
          disabled={false}
          publishStatus="live"
          saveStatus={{
            kind: 'saved',
            atMs: 1_700_000_000_000,
          }}
          ogPreviewSlug="hello"
          revisionSummary={{ kind: 'published-current', revisionNo: 1 }}
        />,
      ),
    )
    expect(html).toContain('基本信息')
    expect(html).toContain('封面 / OG 图')
    expect(html).toContain('展示选项')
    expect(html).toContain('开启评论')
    expect(html).toContain('显示目录')
  })
})

describe('snapshot: PageEditorShell', () => {
  it('renders create mode', () => {
    const html = stableHtml(renderInRouter(<PageEditorShell mode="create" navigate={vi.fn()} />))
    expect(html).toContain('创建页面')
    expect(html).toContain('实时预览')
    expect(html).toContain('PageBodyEditor')
  })

  it('renders edit mode', () => {
    const detail = makePageDetail()
    const html = stableHtml(renderInRouter(<PageEditorShell mode="edit" detail={detail} navigate={vi.fn()} />))
    expect(html).toContain('Hello Page')
    expect(html).toContain('保存草稿')
    expect(html).toContain('发布草稿')
    expect(html).toContain('元数据')
    expect(html).toContain('PageBodyEditor')
  })
})

describe('snapshot: PageEditorRoute', () => {
  it('renders loading skeleton', () => {
    const html = stableHtml(renderInRouter(<PageEditorRoute pageId="1" navigate={vi.fn()} />))
    expect(html).toContain('skeleton')
  })
})
