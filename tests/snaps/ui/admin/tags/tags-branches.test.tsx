import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/types/tags'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { TagsView } from '@/ui/admin/tags/TagsView'

// TagsView drives its rows from a reducer (`useTagsReducer`) and a list
// `useQuery` plus a delete `useMutation`, with the search box wired through
// `useDebouncedSearch`. The existing `tags-view.test.tsx` covers the loading
// and empty states; this spec adds populated rows (the `state.rows.map`
// callback branch), the error state, and the search-active state.

interface ControllerState {
  rows: AdminTagDto[]
  total: number
  hasMore: boolean
  q: string
}

const controllerState = vi.hoisted((): { state: ControllerState } => ({
  state: {
    rows: [] as AdminTagDto[],
    total: 0,
    hasMore: false,
    q: '',
  },
}))

vi.mock('@/ui/admin/tags/useTagsReducer', () => ({
  useTagsReducer: () => ({ state: controllerState.state, dispatch: vi.fn() }),
}))

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isPending: true,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    isPending: false,
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  // Return a hoisted pair so each test can drive the search-input value.
  useDebouncedSearch: () => [debouncedSearch.value, debouncedSearch.setInput],
}))

const debouncedSearch = vi.hoisted(() => ({
  value: '',
  setInput: vi.fn(),
}))

vi.mock('@/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-slot="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-slot="dialog-description">{children}</p>,
  DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-slot="dialog-footer" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-slot="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-slot="dialog-title">{children}</h2>,
}))

// ───────────────────────────── fixtures ─────────────────────────────

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

function setState(overrides: Partial<ControllerState> = {}): void {
  controllerState.state = { ...controllerState.state, ...overrides }
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: TagsView branches', () => {
  beforeEach(() => {
    controllerState.state = { rows: [], total: 0, hasMore: false, q: '' }
    queryMocks.query = {
      data: null,
      isPending: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
    debouncedSearch.value = ''
    debouncedSearch.setInput = vi.fn()
  })

  it('renders populated rows via the state.rows.map callback', () => {
    const a = makeTag({ id: 'tag-1', name: 'react', slug: 'react', postCount: 5 })
    const b = makeTag({ id: 'tag-2', name: 'vite', slug: 'vite', postCount: 2 })
    queryMocks.query = { ...queryMocks.query, isPending: false, data: { tags: [a, b], total: 2, hasMore: false } }
    setState({ rows: [a, b], total: 2 })
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('react')
    expect(html).toContain('vite')
    // TagRow renders the post-count suffix and a deep-link to the posts list.
    expect(html).toContain('5 篇')
    expect(html).toContain('2 篇')
    // Edit / delete affordances carry the tag name in their aria-labels.
    expect(html).toContain('编辑标签 react')
    expect(html).toContain('删除标签 vite')
    // End-of-list sentinel copy.
    expect(html).toContain('已加载全部标签')
  })

  it('renders the empty-state branch once the list resolves without rows', () => {
    queryMocks.query = { ...queryMocks.query, isPending: false }
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('未找到标签')
  })

  it('still renders the chrome when the list query errors (toast path)', () => {
    queryMocks.query = {
      ...queryMocks.query,
      isPending: false,
      error: new Error('network down'),
      data: null,
    }
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    expect(html).toContain('标签管理')
    // With no rows and not pending, the empty state renders. The toast
    // call is mocked so no assertion is needed on its side effect.
    expect(html).toContain('未找到标签')
  })

  it('reflects the active search term in the search input value', () => {
    debouncedSearch.value = '关键'
    queryMocks.query = { ...queryMocks.query, isPending: false }
    const html = stableHtml(renderInRouter(<TagsView />, '/admin/taxonomy/tags'))
    // The search input mirrors the debounced value as its `value` attr.
    expect(html).toContain('value="关键"')
    expect(html).toContain('搜索标签')
  })
})
