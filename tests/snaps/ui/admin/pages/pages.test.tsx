import { describe, expect, it } from 'vitest'

import type { AdminPageDto } from '@/shared/contracts/pages'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PageRow } from '@/ui/admin/pages/PageRow'
import { PagesSkeleton } from '@/ui/admin/pages/PagesSkeleton'
import { PagesView } from '@/ui/admin/pages/PagesView'

function makeAdminPage(overrides: Partial<AdminPageDto> = {}): AdminPageDto {
  const id = overrides.id ?? `${Math.floor(Math.random() * 1_000_000)}`
  return {
    id,
    slug: overrides.slug ?? `page-${id}`,
    title: overrides.title ?? `Page ${id}`,
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '/images/cover.png',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    webmentionsEnabled: overrides.webmentionsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    showFriends: overrides.showFriends ?? false,
    publishedAt: overrides.publishedAt ?? '2024-01-01T00:00:00.000Z',
    publishedRevisionId: overrides.publishedRevisionId ?? 'rev-1',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    authorId: overrides.authorId ?? null,
    authorName: overrides.authorName ?? 'Author',
    commentCount: overrides.commentCount ?? 0,
    commentPublicId: overrides.commentPublicId ?? `comment-${id}`,
  }
}

describe('snapshot: PagesView', () => {
  it('renders the loading state', () => {
    const html = stableHtml(renderInRouter(<PagesView />, '/admin/pages'))
    expect(html).toContain('页面管理')
    expect(html).toContain('新建页面')
    // No active filters — just the pill-bar 筛选 trigger in the header slot.
    expect(html).toContain('筛选')
  })
})

describe('snapshot: PageRow', () => {
  it('renders a published page', () => {
    const page = makeAdminPage({
      id: '1',
      title: 'Hello Page',
      slug: 'hello',
      commentCount: 3,
    })
    const html = stableHtml(renderInRouter(<PageRow page={page} />))
    expect(html).toContain('Hello Page')
    expect(html).toContain('/hello')
    expect(html).toContain('/editor/page/1')
    expect(html).toContain('Author')
    expect(html).toContain('3')
  })

  it('renders a draft page', () => {
    const page = makeAdminPage({
      id: '2',
      title: 'Draft Page',
      published: false,
      publishedRevisionId: null,
    })
    const html = stableHtml(renderInRouter(<PageRow page={page} />))
    expect(html).toContain('Draft Page')
    expect(html).toContain('草稿')
  })

  it('renders a deleted page', () => {
    const page = makeAdminPage({
      id: '3',
      title: 'Deleted Page',
      deletedAt: '2024-03-01T00:00:00.000Z',
    })
    const html = stableHtml(renderInRouter(<PageRow page={page} />))
    expect(html).toContain('Deleted Page')
    expect(html).toContain('已删除')
    expect(html).toContain('data-deleted')
  })

  it('renders a page without cover', () => {
    const page = makeAdminPage({ id: '4', title: 'No Cover', cover: '' })
    const html = stableHtml(renderInRouter(<PageRow page={page} />))
    expect(html).toContain('No Cover')
    expect(html).toContain('lucide-image')
  })
})

describe('snapshot: PagesSkeleton', () => {
  it('renders skeleton rows', () => {
    const html = stableHtml(renderInRouter(<PagesSkeleton />))
    expect(html).toContain('skeleton')
  })
})
