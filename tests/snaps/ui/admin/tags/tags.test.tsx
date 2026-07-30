import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/contracts/tags'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'
import { TagRow, TagsSkeleton } from '@/ui/admin/tags/TagRows'
import { TagsView } from '@/ui/admin/tags/TagsView'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.infinite = {
  data: undefined as { pages: { tags: AdminTagDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: false,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

// TagsView drives its rows from `useAdminInfiniteList` (server state lives
// in the TanStack cache, via an internal `useInfiniteQuery`). The list query
// is stubbed through a hoisted slot so each test can pick the branch; the
// delete mutation and the query client are stubbed alongside.

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

function makeAdminTag(overrides: Partial<AdminTagDto> = {}): AdminTagDto {
  return {
    id: 'tag-1',
    name: '默认标签',
    slug: 'default',
    ogImage: '/images/open-graph.png',
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function resetInfinite(): void {
  queryMocks.infinite = {
    data: undefined,
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
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

describe('snapshot: TagsView', () => {
  beforeEach(() => {
    resetInfinite()
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the loading skeleton while fetching', () => {
    queryMocks.infinite = { ...queryMocks.infinite, isLoading: true }
    const html = stableHtml(renderInRouter(<TagsView />))
    expect(html).toContain('标签管理')
    expect(html).toContain('skeleton')
  })

  it('renders the empty state when no tags exist', () => {
    setList([])
    const html = stableHtml(renderInRouter(<TagsView />))
    expect(html).toContain('标签管理')
    expect(html).toContain('未找到标签')
    expect(html).toContain('新增标签')
  })

  it('renders a list of tags', () => {
    setList([
      makeAdminTag({ id: 'tag-1', name: 'React', slug: 'react', postCount: 8 }),
      makeAdminTag({ id: 'tag-2', name: 'TypeScript', slug: 'typescript', postCount: 5 }),
    ])
    const html = stableHtml(renderInRouter(<TagsView />))
    expect(html).toContain('标签管理')
    expect(html).toContain('2')
    expect(html).toContain('React')
    expect(html).toContain('/admin/posts?tag=React')
    expect(html).toContain('TypeScript')
    expect(html).toContain('/admin/posts?tag=TypeScript')
  })
})

describe('snapshot: TagRow', () => {
  it('renders a tag with name, slug and post count', () => {
    const tag = makeAdminTag({ name: 'React', slug: 'react', postCount: 8 })
    const html = stableHtml(renderInRouter(<TagRow tag={tag} disabled={false} onEdit={() => {}} onDelete={() => {}} />))
    expect(html).toContain('React')
    expect(html).toContain('react')
    expect(html).toContain('8 篇')
    expect(html).toContain('/admin/posts?tag=React')
  })

  it('renders a disabled tag row', () => {
    const tag = makeAdminTag({ name: 'TypeScript', slug: 'typescript', postCount: 0 })
    const html = stableHtml(renderInRouter(<TagRow tag={tag} disabled={true} onEdit={() => {}} onDelete={() => {}} />))
    expect(html).toContain('TypeScript')
    expect(html).toContain('disabled=""')
  })
})

describe('snapshot: TagsSkeleton', () => {
  it('renders placeholder rows', () => {
    const html = stableHtml(renderToHtml(<TagsSkeleton />))
    expect(html).toContain('skeleton')
  })
})

describe('snapshot: EditTagDialog', () => {
  it('renders nothing when closed', () => {
    const html = stableHtml(renderToHtml(<EditTagDialog tag={undefined} onClose={() => {}} onSaved={() => {}} />))
    expect(html).toBe('')
  })

  it('renders the new-tag form when opened for creation', () => {
    function Wrapper() {
      const [target, setTarget] = useState<null | undefined>(undefined)
      if (target === undefined) {
        setTarget(null)
      }
      return <EditTagDialog tag={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('新增标签')
    expect(html).toContain('tag-name')
    expect(html).toContain('tag-slug')
    expect(html).toContain('tag-og-image')
    expect(html).toContain('创建')
  })

  it('renders the edit form for an existing tag', () => {
    const tag = makeAdminTag({ name: 'Next.js', slug: 'nextjs', ogImage: '/images/og/nextjs.png' })
    function Wrapper() {
      const [target, setTarget] = useState<AdminTagDto | undefined>(undefined)
      if (target === undefined) {
        setTarget(tag)
      }
      return <EditTagDialog tag={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('编辑标签')
    expect(html).toContain('tag-name')
    expect(html).toContain('tag-og-image')
    expect(html).toContain('保存')
  })
})
