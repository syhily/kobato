import type { AdminTagDto } from '@kobato/api/contracts/tags'

import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { EditTagDialog } from '@kobato/web-admin/ui/tags/EditTagDialog'
import { TagsView } from '@kobato/web-admin/ui/tags/TagsView'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-client/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as { pages: { tags: AdminTagDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

vi.mock('@kobato/ui/components/dialog', () => import('@kobato/web-admin/tests/utils/dialog'))

describe('snapshot: TagsView', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: undefined,
      isLoading: true,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the header, search box, new-tag button and table chrome while loading', () => {
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('标签管理')
    expect(html).toContain('搜索名称或 slug')
    expect(html).toContain('新增标签')
    expect(html).toContain('名称')
    expect(html).toContain('Slug')
    expect(html).toContain('skeleton')
  })

  it('renders the empty state once the pending query resolves without rows', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      data: { pages: [{ tags: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('标签管理')
    expect(html).toContain('未找到标签')
  })
})

describe('snapshot: EditTagDialog', () => {
  it('renders nothing while closed (friend === undefined)', () => {
    const html = stableHtml(
      renderToHtml(<EditTagDialog tag={undefined} onClose={() => undefined} onSaved={() => undefined} />),
    )
    expect(html).toBe('')
  })
})
