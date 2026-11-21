import type { AdminTagDto } from '@kobato/contracts/tags.ts'

import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { TagsView } from '@kobato/web-admin/ui/tags/TagsView.tsx'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.infinite = {
  data: undefined as { pages: { tags: AdminTagDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: true,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

vi.mock('@kobato/ui/lib/use-debounced-search.ts', () => ({
  useDebouncedSearch: () => [debouncedSearch.value, debouncedSearch.setInput],
}))

vi.mock('@kobato/ui/components/dialog.tsx', () => import('@kobato/web-admin/tests/utils/dialog.tsx'))

const debouncedSearch = vi.hoisted(() => ({
  value: '',
  setInput: vi.fn(),
}))

function makeTag(overrides: Partial<AdminTagDto> = {}): AdminTagDto {
  return {
    id: 'tag-1',
    name: 'react',
    slug: 'react',
    ogImage: '',
    postCount: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function setList(tags: AdminTagDto[], total = tags.length): void {
  queryMocks.infinite = {
    ...queryMocks.infinite,
    data: { pages: [{ tags, total, hasMore: false }] },
    isLoading: false,
    error: null,
  }
}

describe('snapshot: TagsView branches', () => {
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
    debouncedSearch.value = ''
    debouncedSearch.setInput = vi.fn()
  })

  it('renders populated rows via the rows.map callback', () => {
    const a = makeTag({ id: 'tag-1', name: 'react', slug: 'react', postCount: 5 })
    const b = makeTag({ id: 'tag-2', name: 'vite', slug: 'vite', postCount: 2 })
    setList([a, b])
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('react')
    expect(html).toContain('vite')
    expect(html).toContain('5 篇')
    expect(html).toContain('2 篇')
    expect(html).toContain('编辑标签 react')
    expect(html).toContain('删除标签 vite')
    expect(html).toContain('已加载全部标签')
  })

  it('renders the empty-state branch once the list resolves without rows', () => {
    setList([])
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('未找到标签')
  })

  it('still renders the chrome when the list query errors (toast path)', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      error: new Error('network down'),
      data: undefined,
    }
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('标签管理')
    expect(html).toContain('未找到标签')
  })

  it('reflects the active search term in the search input value', () => {
    debouncedSearch.value = '关键'
    setList([])
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('value="关键"')
    expect(html).toContain('搜索标签')
  })
})
