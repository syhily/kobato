import type { AdminImageDto } from '@kobato/contracts/images.ts'
import type { ActiveImageFilter } from '@kobato/web-admin/ui/images/use-images-reducer.ts'

import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/test/render.tsx'
import { ImagesView } from '@kobato/web-admin/ui/images/ImagesView.tsx'
import { ConfirmDialog } from '@kobato/web-admin/ui/shared/ConfirmDialog.tsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// The controller is mocked so the active-filter chips, isFetchingNextPage spinner,
// error-toast fallthrough and the destructive ConfirmDialog can be driven.

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

vi.mock('@kobato/web-admin/ui/images/use-images-reducer.ts', () => ({
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
    controller.q = 'poster'
    controller.kind = 'friend'
    controller.activeFilters = [
      { field: 'q', value: 'poster', label: 'poster' },
      { field: 'kind', value: 'friend', label: '友链海报' },
    ]
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a', kind: 'friend' })], total: 1, hasMore: false }],
    }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('搜索')
    expect(html).toContain('poster')
    expect(html).toContain('用途')
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
    expect(html).toContain('已加载全部 1 张图片')
  })

  it('renders the "加载中…" spinner when the next page is fetching', () => {
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' })], total: 5, hasMore: true }],
    }
    queryMocks.infinite.hasNextPage = true
    queryMocks.infinite.isFetchingNextPage = true

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('加载中…')
    expect(html).not.toContain('已加载全部')
  })

  it('renders the end-of-list footer when there is no next page and images exist', () => {
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
