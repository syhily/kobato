import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'

// CategoriesView is gated behind a reducer controller, a list query, plus
// delete/reorder mutations and a dnd-kit DnD context. We stub the controller
// to empty rows and neutralize the queries and DnD primitives so SSR can
// stream the chrome.

const controllerState = vi.hoisted(() => ({
  rows: [] as AdminCategoryDto[],
  total: 0,
  q: '',
}))

vi.mock('@/ui/admin/categories/useCategoriesReducer', () => ({
  useCategoriesReducer: () => ({ state: controllerState, dispatch: vi.fn() }),
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

// dnd-kit's DragDropManager touches `document`/DOM measurements at mount; the
// snapshots only need the tree structure so we shim each primitive to render
// its children.
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  closestCenter: () => ({}),
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  sortableKeyboardCoordinates: {},
  verticalListSortingStrategy: {},
}))
vi.mock('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: () => ({}),
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

describe('snapshot: CategoriesView', () => {
  beforeEach(() => {
    controllerState.rows = []
    controllerState.total = 0
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

  it('renders the header, new-category button and skeleton while the list query is fetching', () => {
    queryMocks.query = { ...queryMocks.query, isFetching: true }
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('分类管理')
    expect(html).toContain('新增分类')
    // The CategoriesSkeleton renders the same pulse-marked blocks every other
    // skeleton uses, so we look for the shared skeleton class substring.
    expect(html).toContain('skeleton')
  })

  it('renders the empty state once the fetch resolves without rows', () => {
    queryMocks.query = { ...queryMocks.query, isFetching: false }
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('分类管理')
    expect(html).toContain('未找到分类')
  })
})

describe('snapshot: EditCategoryDialog', () => {
  it('renders nothing while closed (category === undefined)', () => {
    const html = stableHtml(
      renderToHtml(<EditCategoryDialog category={undefined} onClose={() => undefined} onSaved={() => undefined} />),
    )
    expect(html).toBe('')
  })
})
