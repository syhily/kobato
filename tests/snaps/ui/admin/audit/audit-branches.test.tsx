import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditLogActorDto, AuditLogItemDto } from '@/shared/contracts/audit'
import type { AuditLogFilterFieldKey } from '@/ui/admin/audit/filter-fields'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AuditLogView } from '@/ui/admin/audit/AuditLogView'

const mocks = mockTanstackQuery()

mocks.filters = [] as ActiveFilter<AuditLogFilterFieldKey>[]

mocks.dispatch = vi.fn()

mocks.actors = [] as AuditLogActorDto[]

mocks.infinite = {
  data: undefined as { pages: { items: AuditLogItemDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: false,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

mocks.query = {
  data: undefined as AuditLogActorDto[] | undefined,
}

mocks.mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}

// Companion to audit-view.test.tsx: drives AuditLogView's remaining branches
// — populated rows, skeleton, has-more sentinel, export-pending label, active
// filter pills. useFilterPills is mocked via a hoisted slot; the real FilterPillBar renders.

vi.mock('@/ui/admin/shared/filter-bar/useFilterPills', async () => {
  const { buildAuditFilterFields } = await vi.importActual<typeof import('@/ui/admin/audit/filter-fields')>(
    '@/ui/admin/audit/filter-fields',
  )
  return {
    useFilterPills: () => ({
      filters: mocks.filters,
      hasFilters: mocks.filters.length > 0,
      dispatch: mocks.dispatch,
      queryInput: () => ({}),
      text: () => ({ op: 'contains', value: '' }),
      dateSingle: () => null,
      dateRange: () => null,
      bar: {
        fields: buildAuditFilterFields(mocks.actors),
        filters: mocks.filters,
        search: {},
        onAddFilter: vi.fn(),
        onRemoveFilter: vi.fn(),
        onClearFilters: vi.fn(),
      },
    }),
  }
})

const ACTORS: AuditLogActorDto[] = [
  { actorId: 'user-1', actorName: '雨帆', email: 'admin@example.com' },
  { actorId: 'user-2', actorName: '访客甲', email: 'guest@example.com' },
]

let rowIdCounter = 0
function makeRow(overrides: Partial<AuditLogItemDto> = {}): AuditLogItemDto {
  rowIdCounter += 1
  return {
    id: String(rowIdCounter),
    action: 'login',
    actorId: 'user-1',
    actorName: '雨帆',
    actorRole: 'admin',
    resourceType: 'session',
    resourceId: null,
    details: null,
    detailsHtml: null,
    ipAddressMasked: '203.0.113.*',
    userAgentMasked: null,
    createdAt: '2024-01-15T02:30:00.000Z',
    ...overrides,
  }
}

function setList(items: AuditLogItemDto[], hasMore = false, total = items.length): void {
  mocks.infinite = {
    ...mocks.infinite,
    data: { pages: [{ items, total, hasMore }] },
    isLoading: false,
    error: null,
    hasNextPage: hasMore,
  }
}

describe('snapshot: AuditLogView branches', () => {
  beforeEach(() => {
    mocks.filters = []
    mocks.dispatch = vi.fn()
    mocks.actors = ACTORS
    mocks.infinite = {
      data: undefined,
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    mocks.query = { data: ACTORS }
    mocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('renders populated log rows via the rows.map callback', () => {
    // Two rows drive rows.map; assert label/actor/resource resolve.
    setList([
      makeRow({ action: 'login', actorName: '雨帆', resourceType: 'session' }),
      makeRow({ action: 'post_published', actorName: '访客甲', resourceType: 'post', resourceId: '128' }),
    ])

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // Row 1 — login action label resolves through ACTION_OPTIONS.
    expect(html).toContain('登录')
    expect(html).toContain('雨帆')
    expect(html).toContain('会话')
    // Row 2 — published-post action + resource id suffix.
    expect(html).toContain('文章发布')
    expect(html).toContain('访客甲')
    expect(html).toContain('文章')
    // End-of-list footer (no hasNextPage + rows > 0).
    expect(html).toContain('已加载全部审计日志')
  })

  it('renders the empty-state branch when no rows are loaded', () => {
    setList([])

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={30} />, '/admin/security/audit-log'))

    expect(html).toContain('暂无审计日志记录')
    expect(html).not.toContain('已加载全部审计日志')
  })

  it('renders the loading skeleton while the first page is pending', () => {
    mocks.infinite = { ...mocks.infinite, data: undefined, isLoading: true }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // Skeleton mounts placeholder rows instead of empty state/footer.
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('暂无审计日志记录')
    expect(html).not.toContain('已加载全部审计日志')
  })

  it('renders the active-filter pills (multi-type) and relocates the filter bar below the header', () => {
    // Active filters relocate the bar below the header and flip the add-button; multiple types drive every pill branch.
    mocks.filters = [
      { field: 'action', value: 'login', label: '登录' },
      { field: 'resourceType', value: 'post', label: '文章' },
      { field: 'ip', value: '203.0.113', label: 'IP' },
    ]
    setList([makeRow()])

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // Each pill surfaces its field label (from FILTER_FIELDS).
    expect(html).toContain('操作类型')
    expect(html).toContain('资源类型')
    // The IP pill renders a text input editor.
    expect(html).toContain('IP')
    expect(html).toContain('登录')
    expect(html).toContain('文章')
    // With filters active the trigger switches to "添加筛选" and the
    // "清除" clear affordance appears.
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
    expect(html).toContain('雨帆')
  })

  it('renders the export button and export-pending label branch', () => {
    // Pending mutation → export label flips to '导出中…'.
    mocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: true }
    setList([])

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    expect(html).toContain('导出中…')
    expect(html).toContain('disabled')
  })

  it('renders the load-more sentinel branch when hasNextPage is true', () => {
    // hasNextPage gates the sentinel div and suppresses the footer.
    setList([makeRow()], true, 50)

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    expect(html).not.toContain('已加载全部审计日志')
    expect(html).toContain('雨帆')
  })
})
