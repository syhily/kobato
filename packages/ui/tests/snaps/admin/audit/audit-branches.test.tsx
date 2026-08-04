import type { AuditLogActorDto, AuditLogItemDto } from '@kobato/shared/contracts/audit'
import type { AuditLogFilterFieldKey } from '@kobato/ui/admin/audit/filter-fields'
import type { ActiveFilter } from '@kobato/ui/admin/shared/filterPillsReducer'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderInRouter, stableHtml } from '#/_helpers/render'

import { AuditLogView } from '@kobato/ui/admin/audit/AuditLogView'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// The companion `audit-view.test.tsx` covers the empty-state shell (no
// filters, no rows) and exercises `AuditLogRow` / the shared filter-pill
// leaves directly. This suite drives the remaining render-path branches in
// `AuditLogView` itself: populated rows (the `rows.map` callback), the
// loading skeleton, the has-more sentinel, the export-pending label, and
// the active-filter pills with the filter bar relocated below the header.
//
// Rows come from `useAdminInfiniteList` (an internal `useInfiniteQuery`,
// stubbed below through a hoisted slot). The pill state lives in
// `useFilterPills`; the module mock swaps ONLY that hook for a hoisted
// slot so tests can inject active filters — the real `<FilterPillBar>`
// still renders them.

vi.mock('@kobato/ui/admin/shared/filter-bar/useFilterPills', async () => {
  const { buildAuditFilterFields } = await vi.importActual<typeof import('@kobato/ui/admin/audit/filter-fields')>(
    '@kobato/ui/admin/audit/filter-fields',
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

// ───────────────────────────── fixtures ─────────────────────────────

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

// ────────────────────────────── setup ───────────────────────────────

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
    // Drive the list into the data-loaded state with two rows. The
    // `rows.map` callback renders each `AuditLogRow`; we assert the
    // user-visible action label + actor name + resource type resolve.
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
    // End-of-list footer is gated behind `rows.length > 0`.
    expect(html).not.toContain('已加载全部审计日志')
  })

  it('renders the loading skeleton while the first page is pending', () => {
    mocks.infinite = { ...mocks.infinite, data: undefined, isLoading: true }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // The skeleton branch mounts placeholder rows instead of the empty
    // state or the list footer.
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('暂无审计日志记录')
    expect(html).not.toContain('已加载全部审计日志')
  })

  it('renders the active-filter pills (multi-type) and relocates the filter bar below the header', () => {
    // `hasActiveFilters` flips the filter-bar placement: when filters
    // are active the bar renders BELOW the header (instead of inside
    // it) and the add-button switches to "添加筛选". Drive multiple
    // filter types so every pill render branch in the shared
    // FilterPillBar / FilterPill runs.
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
    // Resolved value labels.
    expect(html).toContain('登录')
    expect(html).toContain('文章')
    // With filters active the trigger switches to "添加筛选" and the
    // "清除" clear affordance appears.
    expect(html).toContain('添加筛选')
    expect(html).toContain('清除')
    // A populated row still renders under the active filters.
    expect(html).toContain('雨帆')
  })

  it('renders the export button and export-pending label branch', () => {
    // The export button label flips to '导出中…' when the mutation is
    // pending. Drive the mock mutation into the pending state to hit
    // that render branch.
    mocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: true }
    setList([])

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    expect(html).toContain('导出中…')
    // The button is disabled while the export is in flight.
    expect(html).toContain('disabled')
  })

  it('renders the load-more sentinel branch when hasNextPage is true', () => {
    // `hasNextPage` gates the sentinel `<div ref={sentinelRef}>` mount and
    // suppresses the end-of-list footer.
    setList([makeRow()], true, 50)

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // With hasNextPage true the end-of-list footer is hidden.
    expect(html).not.toContain('已加载全部审计日志')
    // The populated row still renders.
    expect(html).toContain('雨帆')
  })
})
