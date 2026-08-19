import { describe, expect, it } from 'vitest'

import { makeAdminPage } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PageRow } from '@/ui/admin/pages/PageRow'
import { PagesSkeleton } from '@/ui/admin/pages/PagesSkeleton'
import { PagesView } from '@/ui/admin/pages/PagesView'

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
