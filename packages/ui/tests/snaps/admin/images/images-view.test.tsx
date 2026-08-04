import type { AdminImageDto } from '@kobato/shared/contracts/images'
import type { ActiveImageFilter } from '@kobato/ui/admin/images/useImagesReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'

import { ImageDetailDialog } from '@kobato/ui/admin/images/ImageDetailDialog'
import { ImagesFilterBar } from '@kobato/ui/admin/images/ImagesFilterBar'
import { ImagesView } from '@kobato/ui/admin/images/ImagesView'
import {
  buildJustifiedRows,
  JustifiedImageGrid,
  JustifiedImageGridSkeleton,
} from '@kobato/ui/admin/images/JustifiedImageGrid'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: { pages: [] as { images: AdminImageDto[]; total: number; hasMore: boolean }[] },
  isLoading: true,
  isPending: true,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  error: null as unknown,
  fetchNextPage: vi.fn(),
}

queryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

queryMocks.queryClient = {
  invalidateQueries: vi.fn(),
}

// `ImagesView` fetches the image library through `useInfiniteQuery` against
// `orpc.admin.images.list`. To exercise the DATA-LOADED render paths (the
// `.map` over images + the empty-state branch) we stub the query layer with
// a hoisted mutable singleton — the same pattern used by tags / friends /
// musics snapshot suites. The infinite-query mock defaults to the pending
// state so the existing loading-state test keeps passing unchanged.

// Canonical AdminImageDto fixture used by the snapshot tests below.
// Dimensions are intentionally varied so the justified-rows algorithm
// has meaningful aspect ratios to pack.
function makeImage(overrides: Partial<AdminImageDto> & { id: string } = { id: 'img-1' }): AdminImageDto {
  return {
    kind: 'generic',
    storagePath: `images/${overrides.id}.jpg`,
    publicUrl: `https://cdn.example.com/images/${overrides.id}.jpg`,
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

describe('snapshot: ImagesView', () => {
  beforeEach(() => {
    // Reset to the pending/loading state so the legacy loading test stays
    // deterministic; data-loaded cases reassign below.
    queryMocks.infinite = {
      data: { pages: [] },
      isLoading: true,
      isPending: true,
      isFetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      error: null,
      fetchNextPage: vi.fn(),
    }
    queryMocks.mutation = { mutate: vi.fn(), isPending: false }
  })

  it('renders the page shell with header, upload button and filter bar under SSR (pending/loading)', () => {
    const html = renderInRouter(<ImagesView />, '/admin/library/images')

    // Header copy — title and the total-count description both render
    // synchronously off the pending query (total defaults to 0).
    expect(html).toContain('图片管理')
    expect(html).toContain('上传图片')

    // Filter bar mounts; the default (no filters) trigger shows the bare
    // "筛选" label, not "添加筛选".
    expect(html).toContain('筛选')

    // Loading branch renders the skeleton (rounded muted placeholder
    // tiles emitted by JustifiedImageGridSkeleton).
    expect(html).toMatch(/rounded-xl/)

    // The upload affordance is a real button surfaced to AT users.
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders the empty-state branch when the query resolves with no images', () => {
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      data: { pages: [{ images: [], total: 0, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))
    // The "未找到图片" empty card replaces the grid; total stays 0.
    expect(html).toContain('图片管理')
    expect(html).toContain('共 0 条')
    expect(html).toContain('未找到图片')
    // No "loaded all" footer in the empty branch.
    expect(html).not.toContain('已加载全部')
  })

  it('renders the populated grid body and end-of-list footer when images resolve', () => {
    const images = [
      makeImage({
        id: 'img-1',
        storagePath: 'images/poster-a.jpg',
        publicUrl: 'https://cdn.example.com/images/poster-a.jpg',
      }),
      makeImage({
        id: 'img-2',
        storagePath: 'images/poster-b.jpg',
        publicUrl: 'https://cdn.example.com/images/poster-b.jpg',
      }),
      makeImage({ id: 'img-3', kind: 'category', storagePath: 'images/categories/news.jpg' }),
    ]
    queryMocks.infinite = {
      ...queryMocks.infinite,
      isLoading: false,
      isPending: false,
      hasNextPage: false,
      data: { pages: [{ images, total: images.length, hasMore: false }] },
    }
    const html = stableHtml(renderInRouter(<ImagesView />, '/admin/library/images'))
    // Header reflects the resolved total.
    expect(html).toContain('图片管理')
    expect(html).toContain(`共 ${images.length} 条`)
    // `JustifiedImageGrid` falls back to its skeleton on SSR (no measured
    // container width), so we assert the end-of-list sentinel copy which
    // only the data-loaded branch emits.
    expect(html).toContain(`已加载全部 ${images.length} 张图片`)
    // The skeleton body is still present alongside the sentinel.
    expect(html).toMatch(/rounded-xl/)
  })
})

describe('snapshot: ImagesFilterBar', () => {
  it('renders the bare "筛选" trigger when no filters are active', () => {
    const html = stableHtml(
      renderToHtml(
        <ImagesFilterBar filters={[]} onAddFilter={() => {}} onRemoveFilter={() => {}} onClearFilters={() => {}} />,
      ),
    )
    expect(html).toContain('筛选')
    // No "添加筛选" / "清除" affordances in the empty state.
    expect(html).not.toContain('添加筛选')
    expect(html).not.toContain('清除')
  })

  it('renders search and kind chips plus the clear button when filters are active', () => {
    const filters: ActiveImageFilter[] = [
      { field: 'q', value: 'poster', label: 'poster' },
      { field: 'kind', value: 'friend', label: '友链海报' },
    ]
    const html = stableHtml(
      renderToHtml(
        <ImagesFilterBar
          filters={filters}
          onAddFilter={() => {}}
          onRemoveFilter={() => {}}
          onClearFilters={() => {}}
        />,
      ),
    )
    // Search chip label + pre-filled value.
    expect(html).toContain('搜索')
    expect(html).toContain('poster')
    // Kind chip label is hardcoded to "用途".
    expect(html).toContain('用途')
    // With filters present the trigger switches to "添加筛选" and the
    // "清除" clear affordance appears.
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
  })
})

describe('snapshot: buildJustifiedRows', () => {
  it('returns an empty array for empty input', () => {
    expect(buildJustifiedRows([], 1200, 200, 12)).toEqual([])
  })

  it('returns an empty array when the container width is zero', () => {
    const rows = buildJustifiedRows([makeImage({ id: 'a' })], 0, 200, 12)
    expect(rows).toEqual([])
  })

  it('packs a single image into one row at the target height', () => {
    // A lone image is flushed as a non-filled last row: the row keeps
    // the target height and the item width follows its aspect ratio
    // (no stretch because the row already fits well below the stretch
    // threshold).
    const rows = buildJustifiedRows([makeImage({ id: 'a', width: 800, height: 600 })], 1200, 200, 12)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.items).toHaveLength(1)
    expect(row.height).toBe(200)
    // width = floor(height * ratio) = floor(200 * 800 / 600).
    expect(row.items[0]!.width).toBe(Math.floor((200 * 800) / 600))
  })

  it('force-fills a single oversized image row so the item spans the container', () => {
    // When the only image would exceed the container at target height
    // (very wide aspect), the row is scaled down to fit and the item
    // width snaps to the container.
    const rows = buildJustifiedRows([makeImage({ id: 'wide', width: 2400, height: 200 })], 1200, 200, 12)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.items).toHaveLength(1)
    expect(row.items[0]!.width).toBe(1200)
    expect(row.height).toBeLessThan(200)
  })

  it('splits overflowing images across multiple rows', () => {
    const images = Array.from({ length: 6 }, (_, i) => makeImage({ id: `img-${i}`, width: 800, height: 600 }))
    const rows = buildJustifiedRows(images, 800, 200, 12)
    expect(rows.length).toBeGreaterThan(1)
    // Every produced row must fit within (or be exactly) the container
    // width accounting for inter-item gaps.
    for (const row of rows) {
      const total = row.items.reduce((sum, item) => sum + item.width, 0) + 12 * (row.items.length - 1)
      expect(total).toBeLessThanOrEqual(800 + 1)
      // Each item within a row shares the row's height.
      expect(row.items.every((item) => item.height === row.height)).toBe(true)
    }
  })
})

describe('snapshot: JustifiedImageGrid (component)', () => {
  it('falls back to the skeleton while the container width is unknown during SSR', () => {
    // useElementWidth returns width=0 on the server, so the grid emits
    // the skeleton placeholder rather than measured rows.
    const html = stableHtml(
      renderToHtml(
        <JustifiedImageGrid
          images={[makeImage({ id: 'a' }), makeImage({ id: 'b' })]}
          assetHost="cdn.example.com"
          onSelect={() => {}}
        />,
      ),
    )
    // The skeleton is rendered as rounded muted tiles inside flex rows.
    expect(html).toMatch(/rounded-xl/)
    // No image thumbnails are emitted while the skeleton is showing.
    expect(html).not.toContain('查看图片')
  })
})

describe('snapshot: JustifiedImageGridSkeleton', () => {
  it('renders four rows of rounded placeholder tiles', () => {
    const html = stableHtml(renderToHtml(<JustifiedImageGridSkeleton />))
    // Skeleton body is a stack of rounded muted tiles.
    expect(html).toMatch(/rounded-xl/)
    // Four rows are emitted by default (see Array.from({ length: 4 })).
    const rowCount = html.match(/height:200/g)?.length ?? 0
    expect(rowCount).toBe(4)
  })
})

describe('snapshot: ImageDetailDialog', () => {
  it('renders nothing when no image is supplied (closed state)', () => {
    const html = stableHtml(
      renderToHtml(
        <ImageDetailDialog
          image={null}
          open={false}
          onClose={() => {}}
          copied={false}
          isSavingNote={false}
          isRecalculatingThumbhash={false}
          onCopyUrl={() => {}}
          onSaveNote={() => {}}
          onDelete={() => {}}
          onRecalculateThumbhash={() => {}}
        />,
      ),
    )
    expect(html).toBe('')
  })

  it('renders nothing when open is true but no image is supplied', () => {
    // Defensive guard: the early-return on `image === null` fires before
    // any DOM is produced, even if `open` is reported as true.
    const html = stableHtml(
      renderToHtml(
        <ImageDetailDialog
          image={null}
          open={true}
          onClose={() => {}}
          copied={false}
          isSavingNote={false}
          isRecalculatingThumbhash={false}
          onCopyUrl={() => {}}
          onSaveNote={() => {}}
          onDelete={() => {}}
          onRecalculateThumbhash={() => {}}
        />,
      ),
    )
    expect(html).toBe('')
  })
})
