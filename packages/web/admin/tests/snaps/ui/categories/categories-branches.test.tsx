import type { AdminCategoryDto } from '@kobato/api/contracts/admin/categories'
import type { ReactNode } from 'react'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { CategoriesView } from '@kobato/web-admin/ui/categories/CategoriesView'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CapturedMutationOptions {
  onMutate?: (variables: { orderedIds: string[] }) => void
  onSuccess?: (payload: unknown) => void
  onError?: (error: Error) => void
}

const mutationCalls = vi.hoisted(() => ({
  captured: [] as CapturedMutationOptions[],
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
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: (options: CapturedMutationOptions) => {
      mutationCalls.captured.push(options)
      return queryMocks.mutation
    },
    useQueryClient: () => queryMocks.queryClient,
  }
})

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  closestCenter: () => ({}),
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  sortableKeyboardCoordinates: {},
  verticalListSortingStrategy: {},
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
  CSS: { Transform: { toString: (t: unknown) => (t ? String(t) : '') } },
}))
vi.mock('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: () => ({}),
}))

vi.mock('@kobato/ui/components/dialog', () => import('@kobato/web-admin/tests/utils/dialog'))

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

describe('snapshot: CategoriesView branches', () => {
  beforeEach(() => {
    mutationCalls.captured = []
    queryMocks.query = {
      data: null,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
    queryMocks.queryClient = { invalidateQueries: vi.fn(), setQueryData: vi.fn() }
  })

  it('renders populated rows via the rows.map callback inside SortableContext', () => {
    const a = makeCategory({ id: 'cat-1', name: '前端', slug: 'frontend', sortOrder: 0, postCount: 4 })
    const b = makeCategory({ id: 'cat-2', name: '随笔', slug: 'essay', sortOrder: 1, postCount: 7 })
    queryMocks.query = { ...queryMocks.query, data: { categories: [a, b], total: 2 } }
    const html = stableHtml(renderInRouter(<CategoriesView />, '/admin/taxonomy/categories'))
    expect(html).toContain('前端')
    expect(html).toContain('随笔')
    expect(html).toContain('4 篇')
    expect(html).toContain('7 篇')
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
    expect(html).toContain('未找到分类')
  })

  it('invalidates the categories list when a delete succeeds so the row disappears', () => {
    const a = makeCategory({ id: 'cat-1', name: '前端', slug: 'frontend' })
    queryMocks.query = { ...queryMocks.query, data: { categories: [a], total: 1 } }
    renderInRouter(<CategoriesView />, '/admin/taxonomy/categories')
    const deleteOptions = mutationCalls.captured[0]
    expect(deleteOptions).toBeDefined()
    deleteOptions.onSuccess?.({})
    expect(toast.success).toHaveBeenCalledWith('已删除分类')
    expect(queryMocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(1)
    expect(queryMocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: orpcQuery.admin.categories.list.key(),
    })
  })

  it('reorder onMutate writes the optimistic order into the list cache', () => {
    const a = makeCategory({ id: 'cat-1', name: '前端', sortOrder: 0 })
    const b = makeCategory({ id: 'cat-2', name: '随笔', sortOrder: 1 })
    queryMocks.query = { ...queryMocks.query, data: { categories: [a, b], total: 2 } }
    renderInRouter(<CategoriesView />, '/admin/taxonomy/categories')
    const reorderOptions = mutationCalls.captured[1]
    expect(reorderOptions).toBeDefined()
    reorderOptions.onMutate?.({ orderedIds: ['cat-2', 'cat-1'] })
    expect(queryMocks.queryClient.setQueryData).toHaveBeenCalledTimes(1)
    const [, next] = queryMocks.queryClient.setQueryData.mock.calls[0] as [
      unknown,
      { categories: AdminCategoryDto[]; total: number },
    ]
    expect(next.total).toBe(2)
    expect(next.categories.map((row) => row.id)).toEqual(['cat-2', 'cat-1'])
    expect(next.categories.map((row) => row.sortOrder)).toEqual([0, 1])
  })
})
