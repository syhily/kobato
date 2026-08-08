import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'

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

// CategoriesView reads rows from the list useQuery + delete/reorder
// mutations and a dnd-kit context; queries and DnD primitives are neutralized for SSR.

// dnd-kit touches DOM at mount — each primitive is shimmed to render children.
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

vi.mock('@/ui/components/dialog', () => import('#/_helpers/stubs/dialog'))

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
    // Skeleton uses the shared pulse class substring.
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
