import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'

import { CategoriesView } from '@kobato/ui/admin/categories/CategoriesView'
import { EditCategoryDialog } from '@kobato/ui/admin/categories/EditCategoryDialog'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as unknown,
  isPending: true,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}

// CategoriesView reads its rows straight from the list `useQuery` data
// (TanStack single-track) plus delete/reorder mutations and a dnd-kit DnD
// context. We neutralize the queries and DnD primitives so SSR can stream
// the chrome.

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

vi.mock('@kobato/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

describe('snapshot: CategoriesView', () => {
  beforeEach(() => {
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
