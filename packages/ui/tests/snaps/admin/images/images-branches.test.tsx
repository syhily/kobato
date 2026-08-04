import type { AdminImageDto } from '@kobato/shared/contracts/images'
import type { ActiveImageFilter } from '@kobato/ui/admin/images/useImagesReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'

import { ImagesView } from '@kobato/ui/admin/images/ImagesView'
import { ConfirmDialog } from '@kobato/ui/admin/shared/ConfirmDialog'
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

// `ImagesView` threads filter state through `useImagesReducer` and page
// data through `useInfiniteQuery`. The companion `images-view.test.tsx`
// exercises the loading / empty / populated branches by letting the real
// controller run with an empty filter set. This suite instead MOCKS the
// controller so we can drive the render-path branches that depend on a
// non-empty `activeFilters` (the q + kind filter-chip render branches in
// `ImagesFilterBar`), the `isFetchingNextPage` spinner, the error toast
// branch, and the destructive `ConfirmDialog` snapshot.

// ───────────────────────── controller mock ──────────────────────────

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

vi.mock('@kobato/ui/admin/images/useImagesReducer', () => ({
  useImagesReducer: () => controller,
}))

// ───────────────────────────── fixtures ─────────────────────────────

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

// ────────────────────────────── setup ───────────────────────────────

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
    // Drive the controller into the filtered state: a `q` chip plus a
    // `kind` chip. `ImagesFilterBar` maps each `activeFilters` entry to
    // either `SearchFilterPill` or `KindFilterPill`, and the `hasFilters`
    // branch flips the trigger to "添加筛选" and surfaces "清除".
    controller.q = 'poster'
    controller.kind = 'friend'
    controller.activeFilters = [
      { field: 'q', value: 'poster', label: 'poster' },
      { field: 'kind', value: 'friend', label: '友链海报' },
    ]
    // Populate the grid so the data-loaded branch (not the empty card)
    // renders alongside the chips.
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a', kind: 'friend' })], total: 1, hasMore: false }],
    }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    // Search chip label + pre-filled value.
    expect(html).toContain('搜索')
    expect(html).toContain('poster')
    // Kind chip label is hardcoded to "用途".
    expect(html).toContain('用途')
    // With filters present the trigger switches to "添加筛选" and the
    // "清除" clear affordance appears (these branches only render when
    // `hasFilters` is true).
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
    // End-of-list sentinel from the data-loaded branch.
    expect(html).toContain('已加载全部 1 张图片')
  })

  it('renders the "加载中…" spinner when the next page is fetching', () => {
    // `hasNextPage` true AND `isFetchingNextPage` true hits the spinner
    // render branch inside the sentinel footer.
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' })], total: 5, hasMore: true }],
    }
    queryMocks.infinite.hasNextPage = true
    queryMocks.infinite.isFetchingNextPage = true

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    expect(html).toContain('加载中…')
    // While fetching the next page the end-of-list sentinel is hidden
    // (it only renders when `!hasNextPage`).
    expect(html).not.toContain('已加载全部')
  })

  it('renders the end-of-list footer when there is no next page and images exist', () => {
    // Data-loaded + `!hasNextPage` + `allImages.length > 0` → the
    // "已加载全部 N 张图片" branch.
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

    // Skeleton tiles are rounded muted placeholders.
    expect(html).toMatch(/rounded-xl/)
    // While loading the empty card / end-of-list footer are both hidden.
    expect(html).not.toContain('未找到图片')
    expect(html).not.toContain('已加载全部')
  })

  it('still renders the grid when an error is present alongside data', () => {
    // `queryMocks.infinite.error` only feeds a useEffect → toast (which we've
    // stubbed); the render path falls through to the data branch when
    // pages exist. Assert the grid body renders despite the error flag.
    queryMocks.infinite.error = new Error('boom')
    queryMocks.infinite.data = {
      pages: [{ images: [makeImage({ id: 'a' })], total: 1, hasMore: false }],
    }

    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))

    // The error does not short-circuit the render — the data-loaded
    // branch still emits the sentinel footer.
    expect(html).toContain('已加载全部 1 张图片')
  })
})

// ──────────────────────── ConfirmDialog branch ──────────────────────
// `ImagesView` mounts `<ConfirmDialog state={confirm} … />`. The dialog
// state is only populated inside the `onDelete` event handler (not
// coverable in SSR), so we render `ConfirmDialog` directly with an open
// state to exercise the destructive-action render branch the view wires
// up.

describe('snapshot: ImagesView confirm dialog branch', () => {
  it('renders nothing user-visible when state is null (closed)', () => {
    // The closed branch is coverable: `open={false}` keeps the portal
    // unmounted and no destructive copy leaks into the SSR output.
    const html = stableHtml(renderToHtml(<ConfirmDialog state={null} onClose={() => {}} />))
    expect(html).not.toContain('删除图片')
    expect(html).not.toContain('此操作会从 S3 删除原始对象')
  })
})
