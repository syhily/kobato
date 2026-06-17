import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'

// CategoriesView drives its rows from a reducer (`useCategoriesController`)
// and a list `useQuery` plus delete / reorder `useMutation`s, with DnD via
// dnd-kit. The existing `categories-view.test.tsx` covers the loading and
// empty states; this spec adds populated rows (the `state.rows.map`
// callback inside the SortableContext) and the error state.

interface ControllerState {
  rows: AdminCategoryDto[]
  total: number
  q: string
}

const controllerState = vi.hoisted(() => ({
  state: {
    rows: [] as AdminCategoryDto[],
    total: 0,
    q: '',
  } satisfies ControllerState,
}))

vi.mock('@/ui/admin/categories/useCategoriesController', () => ({
  useCategoriesController: () => ({ state: controllerState.state, dispatch: vi.fn() }),
}))

const queryMocks = vi.hoisted(() => ({
  query: {
    data: null as unknown,
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

// dnd-kit touches `document`/DOM measurements at mount; the snapshot only
// needs the tree structure, so each primitive is shimmed to render its
// children (mirrors categories-view.test.tsx).
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
  // `useSortable` is called inside CategoryRow; return stable no-op values
  // so SSR can render the row markup without touching the DOM.
  useSortable: () => ({
    attributes: { 'aria-roledescription': 'sortable' },
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  // CategoryRow imports the CSS helper for transform serialisation.
  CSS: { Transform: { toString: (t: unknown) => (t ? String(t) : '') } },
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

// ───────────────────────────── fixtures ─────────────────────────────

function makeCategory(overrides: Partial<AdminCategoryDto> = {}): AdminCategoryDto {
  return {
    id: 'cat-1',
    name: '前端',
    slug: 'frontend',
    cover: '/images/cover.png',
    og: null,
    description: '前端相关',
    sortOrder: 0,
    postCount: 4,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function setState(overrides: Partial<ControllerState> = {}): void {
  controllerState.state = { ...controllerState.state, ...overrides }
}

// ─────────────────────────── shared setup ───────────────────────────

describe('snapshot: CategoriesView branches', () => {
  beforeEach(() => {
    controllerState.state = { rows: [], total: 0, q: '' }
    queryMocks.query = {
      data: null,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders populated rows via the state.rows.map callback inside SortableContext', () => {
    const a = makeCategory({ id: 'cat-1', name: '前端', slug: 'frontend', sortOrder: 0, postCount: 4 })
    const b = makeCategory({ id: 'cat-2', name: '随笔', slug: 'essay', sortOrder: 1, postCount: 7 })
    queryMocks.query = { ...queryMocks.query, data: { categories: [a, b], total: 2 } }
    setState({ rows: [a, b], total: 2 })
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('前端')
    expect(html).toContain('随笔')
    // CategoryRow renders the post-count suffix.
    expect(html).toContain('4 篇')
    expect(html).toContain('7 篇')
    // Header title shows the resolved total.
    expect(html).toContain('分类管理')
  })

  it('renders the empty-state branch once the list resolves without rows', () => {
    queryMocks.query = { ...queryMocks.query, isFetching: false }
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('未找到分类')
  })

  it('still renders the chrome when the list query errors (toast path)', () => {
    queryMocks.query = {
      ...queryMocks.query,
      error: new Error('kaboom'),
      data: null,
    }
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('分类管理')
    // No rows + not fetching => empty state. The toast is mocked.
    expect(html).toContain('未找到分类')
  })
})
