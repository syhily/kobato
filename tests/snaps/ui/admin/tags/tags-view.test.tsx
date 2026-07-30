import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/contracts/tags'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'
import { TagsView } from '@/ui/admin/tags/TagsView'

// The view drives its rows from `useInfiniteQuery` (server state lives in
// the TanStack cache) plus a delete `useMutation`, with the search box wired
// through `useDebouncedSearch`. We stub the list query so SSR can emit the
// loading / empty chrome. The TanStack hook seams are owned by
// `#/_helpers/mock-react-query`; `sonner` and `useSettingsMutation` are
// inert global stubs registered in `tests/snaps/setup.ts`; the dialog double
// lives in `#/_helpers/stubs/dialog`.

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as { pages: { tags: AdminTagDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

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
    // The skeleton occupies the table body before data arrives.
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
