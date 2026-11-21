import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { CategoriesView } from '@kobato/web-admin/ui/categories/CategoriesView.tsx'
import { EditCategoryDialog } from '@kobato/web-admin/ui/categories/EditCategoryDialog.tsx'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
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

vi.mock('@kobato/ui/components/dialog.tsx', () => import('@kobato/web-admin/tests/utils/dialog.tsx'))

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
