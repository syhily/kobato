import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { CategoriesView } from '@/ui/admin/categories/CategoriesView'
import { CategoriesSkeleton, CategoryRow } from '@/ui/admin/categories/CategoryRow'
import { EditCategoryDialog } from '@/ui/admin/categories/EditCategoryDialog'

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
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  },
  mutation: {
    mutate: vi.fn(),
    isPending: false,
  },
  infinite: {
    data: { pages: [] as unknown[] },
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    fetchNextPage: vi.fn(),
  },
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
    useInfiniteQuery: () => queryMocks.infinite,
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/ui/admin/shared/useDebouncedSearch', () => ({
  useDebouncedSearch: () => ['', vi.fn()],
}))

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
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: () => ({}),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: (transform: { x: number; y: number } | null) =>
        transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    },
  },
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

function makeAdminCategory(overrides: Partial<AdminCategoryDto> = {}): AdminCategoryDto {
  return {
    id: 'cat-1',
    name: '默认分类',
    slug: 'default',
    cover: '/images/categories/default.jpg',
    og: null,
    description: '',
    sortOrder: 0,
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: CategoriesView', () => {
  beforeEach(() => {
    controllerState.rows = []
    controllerState.total = 0
    controllerState.q = ''
    queryMocks.query = {
      data: null as unknown,
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the loading skeleton while fetching', () => {
    queryMocks.query = { ...queryMocks.query, isFetching: true }
    const html = stableHtml(renderToHtml(<CategoriesView />))
    expect(html).toContain('分类管理')
    expect(html).toContain('新增分类')
    expect(html).toContain('skeleton')
  })

  it('renders the empty state when no categories exist', () => {
    queryMocks.query = { ...queryMocks.query, isFetching: false }
    const html = stableHtml(renderToHtml(<CategoriesView />))
    expect(html).toContain('分类管理')
    expect(html).toContain('未找到分类')
    expect(html).toContain('新增分类')
  })

  it('renders a list of categories', () => {
    controllerState.rows = [
      makeAdminCategory({ id: 'cat-1', name: '编程', slug: 'programming', postCount: 12 }),
      makeAdminCategory({ id: 'cat-2', name: '随笔', slug: 'essays', postCount: 3 }),
    ]
    controllerState.total = 2
    queryMocks.query = { ...queryMocks.query, isFetching: false }
    const html = stableHtml(renderInRouter(<CategoriesView />))
    expect(html).toContain('分类管理')
    expect(html).toContain('2')
    expect(html).toContain('编程')
    expect(html).toContain('/cats/programming')
    expect(html).toContain('随笔')
    expect(html).toContain('/cats/essays')
  })
})

describe('snapshot: CategoryRow', () => {
  it('renders a category with cover, description and post count', () => {
    const category = makeAdminCategory({
      name: '编程',
      slug: 'programming',
      cover: '/images/categories/programming.jpg',
      description: '关于编程的一切',
      postCount: 12,
      sortOrder: 1,
    })
    const html = stableHtml(
      renderInRouter(<CategoryRow category={category} sortEnabled={true} onEdit={() => {}} onDelete={() => {}} />),
    )
    expect(html).toContain('编程')
    expect(html).toContain('/cats/programming')
    expect(html).toContain('关于编程的一切')
    expect(html).toContain('12 篇')
    expect(html).toContain('/images/categories/programming.jpg')
  })

  it('renders a category without cover or description', () => {
    const category = makeAdminCategory({ name: '随笔', slug: 'essays', cover: '', description: '', postCount: 3 })
    const html = stableHtml(
      renderInRouter(<CategoryRow category={category} sortEnabled={false} onEdit={() => {}} onDelete={() => {}} />),
    )
    expect(html).toContain('随笔')
    expect(html).toContain('/cats/essays')
    expect(html).toContain('3 篇')
    expect(html).not.toContain('/images/categories/')
    expect(html).toContain('cursor-not-allowed')
  })
})

describe('snapshot: CategoriesSkeleton', () => {
  it('renders placeholder rows', () => {
    const html = stableHtml(renderToHtml(<CategoriesSkeleton />))
    expect(html).toContain('skeleton')
  })
})

describe('snapshot: EditCategoryDialog', () => {
  it('renders nothing when closed', () => {
    const html = stableHtml(
      renderToHtml(<EditCategoryDialog category={undefined} onClose={() => {}} onSaved={() => {}} />),
    )
    expect(html).toBe('')
  })

  it('renders the new-category form when opened for creation', () => {
    function Wrapper() {
      const [target, setTarget] = useState<null | undefined>(undefined)
      if (target === undefined) {
        setTarget(null)
      }
      return <EditCategoryDialog category={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('新增分类')
    expect(html).toContain('category-name')
    expect(html).toContain('category-slug')
    expect(html).toContain('category-cover')
    expect(html).toContain('category-og')
    expect(html).toContain('category-description')
    expect(html).toContain('创建')
  })

  it('renders the edit form pre-filled with the existing category', () => {
    const category = makeAdminCategory({
      name: '摄影',
      slug: 'photography',
      cover: '/images/categories/photography.jpg',
      og: '/images/og/cats/photography.png',
      description: '镜头下的世界',
    })
    function Wrapper() {
      const [target, setTarget] = useState<AdminCategoryDto | undefined>(undefined)
      if (target === undefined) {
        setTarget(category)
      }
      return <EditCategoryDialog category={target} onClose={() => {}} onSaved={() => {}} />
    }
    const html = stableHtml(renderToHtml(<Wrapper />))
    expect(html).toContain('编辑分类')
    expect(html).toContain('category-name')
    expect(html).toContain('category-cover')
    expect(html).toContain('保存')
  })
})
