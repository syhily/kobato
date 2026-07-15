import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminTagDto } from '@/shared/types/tags'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { EditTagDialog } from '@/ui/admin/tags/EditTagDialog'
import { TagsView } from '@/ui/admin/tags/TagsView'

// The view drives its rows through a reducer hook plus four TanStack-query
// calls (list + delete mutation). We stub the controller to keep an empty
// list and short-circuit the queries so SSR can emit the loading chrome.

const controllerState = vi.hoisted(() => ({
  rows: [] as AdminTagDto[],
  total: 0,
  hasMore: false,
  q: '',
}))

vi.mock('@/ui/admin/tags/useTagsReducer', () => ({
  useTagsReducer: () => ({ state: controllerState, dispatch: vi.fn() }),
}))

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
    isPending: true,
    isFetching: false,
    error: null,
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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => ['', vi.fn()],
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

describe('snapshot: TagsView', () => {
  beforeEach(() => {
    controllerState.rows = []
    controllerState.total = 0
    controllerState.hasMore = false
    controllerState.q = ''
    queryMocks.query = {
      data: null,
      isPending: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the header, search box, new-tag button and table chrome while loading', () => {
    queryMocks.query = { ...queryMocks.query, isPending: true }
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
    queryMocks.query = { ...queryMocks.query, isPending: false }
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
