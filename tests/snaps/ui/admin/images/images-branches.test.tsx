import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { ActiveImageFilter } from '@/ui/admin/images/useImagesReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { ImagesView } from '@/ui/admin/images/ImagesView'
import { ConfirmDialog } from '@/ui/admin/shared/ConfirmDialog'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [] as { images: AdminImageDto[]; total: number; hasMore: boolean }[] },
  isLoading: false,
  isPending: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as unknown,
  fetchNextPage: vi.fn(),
}

queryMocks.mutation = { mutate: vi.fn(), isPending: false }

queryMocks.queryClient = { invalidateQueries: vi.fn() }

// Companion to images-view.test.tsx: the controller is mocked so the
// active-filter chip branches, isFetchingNextPage spinner, error-toast
// fallthrough and the destructive ConfirmDialog can be driven.

interface ControllerShape {
  q: string
  kind: 'generic' | 'category' | 'friend' | 'all'
  dispatch: ReturnType<typeof vi.fn>
  pageSize: number
  activeFilters: ActiveImageFilter[]
}

const controller = vi.hoisted<ControllerShape>(() => ({
  q: '',
  kind: 'all' as ControllerShape['kind'],
  dispatch: vi.fn(),
  pageSize: 60,
  activeFilters: [],
}))

vi.mock('@/ui/admin/images/useImagesReducer', () => ({
  useImagesReducer: () => controller,
}))

function makeImage(overrides: Partial<AdminImageDto> & { id: string }): AdminImageDto {
  return {
    kind: 'generic',
    storagePath: `images/${overrides.id}.jpg`,
    publicUrl: `https://assets.example.com/images/${overrides.id}.jpg`,
    mimeType: 'image/jpeg',
    width: 400,
    height: 300,
    byteSize: 1024,
    thumbhash: null,
    uploaderId: null,
    uploaderName: null,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('snapshot: ImagesView branches', () => {
  beforeEach(() => {
    controller.q = ''
    controller.kind = 'all'
    controller.activeFilters = []
    queryMocks.infinite.data = { pages: [] }
    queryMocks.infinite.isLoading = false
    queryMocks.infinite.isPending = false
    queryMocks.infinite.isFetching = false
    queryMocks.infinite.isFetchingNextPage = false
    queryMocks.infinite.hasNextPage = false
    queryMocks.infinite.error = null
  })

  it('renders the active-filter chips (q + kind) so the filter-bar pill branches run', () => {
    // q + kind chips drive the pill map; hasFilters flips trigger to "添加筛选" + "清除".
    controller.q = 'poster'
    controller.kind = 'friend'
    controller.activeFilters = [
      { field: 'q', value: 'poster', label: 'poster' },
      { field: 'kind', value: 'friend', label: '友链海报' },
    ]
    // Populate the grid so the data-loaded branch renders alongside the chips.
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a', kind: 'friend' })], total: 1, hasMore: false }],
    }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('搜索')
    expect(html).toContain('poster')
    // Kind chip label is hardcoded to "用途".
    expect(html).toContain('用途')
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
    expect(html).toContain('已加载全部 1 张图片')
  })

  it('renders the "加载中…" spinner when the next page is fetching', () => {
    // hasNextPage + isFetchingNextPage → spinner branch in the sentinel footer.
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' })], total: 5, hasMore: true }],
    }
    queryMocks.infinite.hasNextPage = true
    queryMocks.infinite.isFetchingNextPage = true

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('加载中…')
    // Sentinel hidden while fetching (renders only when !hasNextPage).
    expect(html).not.toContain('已加载全部')
  })

  it('renders the end-of-list footer when there is no next page and images exist', () => {
    // !hasNextPage + images → "已加载全部 N 张图片" branch.
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' }), makeImage({ id: 'b' })], total: 2, hasMore: false }],
    }
    queryMocks.infinite.hasNextPage = false

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('已加载全部 2 张图片')
  })

  it('renders the empty-state card when the resolved list has no images', () => {
    queryMocks.infinite.data = { pages: [{ images: [], total: 0, hasMore: false }] }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('未找到图片')
    // The end-of-list footer is gated behind `allImages.length > 0`.
    expect(html).not.toContain('已加载全部')
  })

  it('renders the loading skeleton while the first page is pending', () => {
    queryMocks.infinite.isLoading = true

    const html = renderInRouter(<ImagesView />, '/admin/library/images')

    expect(html).toMatch(/rounded-xl/)
    expect(html).not.toContain('未找到图片')
    expect(html).not.toContain('已加载全部')
  })

  it('still renders the grid when an error is present alongside data', () => {
    // error only feeds a stubbed toast effect — the render path falls through to data.
    queryMocks.infinite.error = new Error('boom')
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' })], total: 1, hasMore: false }],
    }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('已加载全部 1 张图片')
  })
})

// The dialog state only populates inside the onDelete handler (not coverable
// in SSR) — render ConfirmDialog directly.

describe('snapshot: ImagesView confirm dialog branch', () => {
  it('renders nothing user-visible when state is null (closed)', () => {
    // open={false} keeps the portal unmounted — no destructive copy in SSR output.
    const html = stableHtml(renderToHtml(<ConfirmDialog state={null} onClose={() => {}} />))
    expect(html).not.toContain('删除图片')
    expect(html).not.toContain('此操作会从 S3 删除原始对象')
  })
})
