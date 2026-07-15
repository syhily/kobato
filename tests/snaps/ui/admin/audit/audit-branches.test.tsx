import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditLogActorDto, AuditLogItemDto } from '@/shared/types/audit'
import type { ActiveFilter } from '@/ui/admin/audit/useAuditLogReducer'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { AuditLogView } from '@/ui/admin/audit/AuditLogView'

// The companion `audit-view.test.tsx` covers the empty-state shell (no
// filters, no rows) and exercises `AuditLogRow` / filter-pill components
// directly. This suite drives the remaining render-path branches in
// `AuditLogView` itself by MOCKING `useAuditLogReducer` so we can
// populate `state.items` (the `.map` callback), `state.hasMore`, and
// `state.filters` (the `hasActiveFilters` header-vs-body placement +
// the multi-type filter-pill render branches) without depending on the
// data-load effect (which never fires under SSR).

// ─────────────────────── controller mock ────────────────────────────

interface ControllerShape {
  state: {
    items: AuditLogItemDto[]
    total: number
    hasMore: boolean
    filters: ActiveFilter[]
  }
  dispatch: ReturnType<typeof vi.fn>
  pageSize: number
  hasMore: boolean
  filterAction: string
  filterResourceType: string
  filterActorId: string
  filterDateFrom: string
  filterDateTo: string
}

const controller = vi.hoisted<ControllerShape>(() => ({
  state: { items: [], total: 0, hasMore: false, filters: [] },
  dispatch: vi.fn(),
  pageSize: 20,
  hasMore: false,
  filterAction: '',
  filterResourceType: '',
  filterActorId: '',
  filterDateFrom: '',
  filterDateTo: '',
}))

vi.mock('@/ui/admin/audit/useAuditLogReducer', () => ({
  useAuditLogReducer: () => controller,
  // Re-exported by the source module; keep the stubs available so the
  // real imports inside AuditLogView's transitive graph still resolve.
  parseDateFilter: () => null,
  dateFilterLabel: () => '时间',
  resolveDateFilterBounds: () => ({ from: '', to: '' }),
}))

// ─────────────────────── react-query mock ───────────────────────────

const queryMocks = vi.hoisted(() => ({
  query: {
    data: undefined as AuditLogActorDto[] | undefined,
    isPending: false,
    error: null as unknown,
  },
  mutation: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.query,
    useMutation: () => queryMocks.mutation,
  }
})

// `orpcQuery` builds the query/mutation option objects the hooks above
// consume; stub the option builders so the import stays side-effect free.
vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      auditLog: {
        actors: { queryOptions: () => ({ queryKey: ['actors'], queryFn: async () => [] }) },
        exportCsv: { mutationOptions: () => ({ mutationKey: ['exportCsv'] }) },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

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

// ────────────────────────────── setup ───────────────────────────────

describe('snapshot: AuditLogView branches', () => {
  beforeEach(() => {
    controller.state = { items: [], total: 0, hasMore: false, filters: [] }
    controller.hasMore = false
    controller.filterAction = ''
    controller.filterResourceType = ''
    controller.filterActorId = ''
    controller.filterDateFrom = ''
    controller.filterDateTo = ''
    queryMocks.query = { data: ACTORS, isPending: false, error: null }
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('renders populated log rows via the state.items.map callback', () => {
    // Drive the controller into the data-loaded state with two rows.
    // The `.map` callback renders each `AuditLogRow`; we assert the
    // user-visible action label + actor name + resource type resolve.
    controller.state = {
      items: [
        makeRow({ action: 'login', actorName: '雨帆', resourceType: 'session' }),
        makeRow({ action: 'post_published', actorName: '访客甲', resourceType: 'post', resourceId: '128' }),
      ],
      total: 2,
      hasMore: false,
      filters: [],
    }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // Row 1 — login action label resolves through ACTION_OPTIONS.
    expect(html).toContain('登录')
    expect(html).toContain('雨帆')
    expect(html).toContain('会话')
    // Row 2 — published-post action + resource id suffix.
    expect(html).toContain('文章发布')
    expect(html).toContain('访客甲')
    expect(html).toContain('文章')
    // End-of-list sentinel (no hasMore + items > 0).
    expect(html).toContain('已加载全部审计日志')
  })

  it('renders the empty-state branch when no rows are loaded', () => {
    controller.state = { items: [], total: 0, hasMore: false, filters: [] }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={30} />, '/admin/security/audit-log'))

    expect(html).toContain('暂无审计日志记录')
    // End-of-list sentinel is gated behind `items.length > 0`.
    expect(html).not.toContain('已加载全部审计日志')
  })

  it('renders the active-filter pills (multi-type) and relocates the filter bar below the header', () => {
    // `hasActiveFilters` flips the filter-bar placement: when filters
    // are active the bar renders BELOW the header (instead of inside
    // it) and the add-button switches to "添加筛选". Drive the
    // controller with multiple filter types so every pill render branch
    // in AuditLogFilterBar / AuditLogFilterPill runs.
    controller.state = {
      items: [makeRow()],
      total: 1,
      hasMore: false,
      filters: [
        { field: 'action', value: 'login', label: '登录' },
        { field: 'resourceType', value: 'post', label: '文章' },
        { field: 'ip', value: '203.0.113', label: 'IP' },
      ],
    }

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
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: true }
    controller.state = { items: [], total: 0, hasMore: false, filters: [] }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    expect(html).toContain('导出中…')
    // The button is disabled while the export is in flight.
    expect(html).toContain('disabled')
  })

  it('renders the load-more sentinel + spinner branch when hasMore is true', () => {
    // `state.hasMore` gates the sentinel `<div ref={sentinelRef}>`
    // mount. The `loadingMore` spinner branch is event-gated (set in
    // the IntersectionObserver callback), so the coverable branch here
    // is the sentinel + the absence of the end-of-list footer.
    controller.state = {
      items: [makeRow()],
      total: 50,
      hasMore: true,
      filters: [],
    }

    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // With hasMore true the end-of-list footer is hidden.
    expect(html).not.toContain('已加载全部审计日志')
    // The populated row still renders.
    expect(html).toContain('雨帆')
  })
})
