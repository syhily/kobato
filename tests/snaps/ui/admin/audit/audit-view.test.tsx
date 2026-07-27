import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditLogActorDto, AuditLogItemDto } from '@/shared/contracts/audit'
import type { AuditLogFilterFieldKey } from '@/ui/admin/audit/filter-fields'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AuditLogRow } from '@/ui/admin/audit/AuditLogRow'
import { AuditLogView } from '@/ui/admin/audit/AuditLogView'
import { buildAuditFilterFields } from '@/ui/admin/audit/filter-fields'
import { FilterAddButton } from '@/ui/admin/shared/filter-bar/add-button'
import { FilterPill } from '@/ui/admin/shared/filter-bar/pill'

// AuditLogView drives its rows from `useAdminInfiniteList` (server state
// lives in the TanStack cache, via an internal `useInfiniteQuery`). The list
// query is stubbed through a hoisted slot so each test can pick the branch;
// the actors query and the export mutation are stubbed alongside.

const queryMocks = vi.hoisted(() => ({
  infinite: {
    data: undefined as { pages: { items: AuditLogItemDto[]; total: number; hasMore: boolean }[] } | undefined,
    isLoading: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  query: {
    data: undefined as AuditLogActorDto[] | undefined,
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
    useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => queryMocks.query),
    useMutation: () => queryMocks.mutation,
    useInfiniteQuery: () => queryMocks.infinite,
  }
})

// `orpcQuery` builds the query/mutation option objects the hooks above
// consume; stub the option builders so the import stays side-effect free.
vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      auditLog: {
        list: { infiniteOptions: () => ({ queryKey: ['auditLog', 'list'] }) },
        actors: { queryOptions: () => ({ queryKey: ['actors'], queryFn: async () => [] }) },
        exportCsv: { mutationOptions: () => ({ mutationKey: ['exportCsv'] }) },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Canonical fixtures shared by the snapshot tests below. Shapes mirror
// `AuditLogItemDto` / `AuditLogActorDto` exactly so changing the wire
// type fails this suite loudly.

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

const ACTORS: AuditLogActorDto[] = [
  { actorId: 'user-1', actorName: '雨帆', email: 'admin@example.com' },
  { actorId: 'user-2', actorName: '访客甲', email: 'guest@example.com' },
]

describe('snapshot: AuditLogView', () => {
  beforeEach(() => {
    queryMocks.infinite = {
      data: { pages: [{ items: [], total: 0, hasMore: false }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    queryMocks.query = { data: ACTORS }
    queryMocks.mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  })

  it('renders the page shell under SSR (header, filter trigger, export button)', () => {
    // The list query resolves with zero rows and no active filters, so the
    // empty-state branch renders; we assert the always-on chrome (header
    // copy, the "筛选" trigger that the filter bar mounts when no filter is
    // active, and the export affordance).
    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    // Header copy — title and the retention-window description both
    // render synchronously off the props.
    expect(html).toContain('审计日志')
    expect(html).toContain('90')

    // Filter bar mounts inside the header when no filters are active;
    // the add-button shows the bare "筛选" label (not "添加筛选").
    expect(html).toContain('筛选')

    // Export affordance is a real button surfaced to AT users.
    expect(html).toContain('导出 CSV')
    expect(html).toMatch(/<button[^>]*>/)

    // With no fetched rows and no active filter, the empty branch
    // renders the placeholder copy. We do not assert fetched rows.
    expect(html).toContain('暂无审计日志记录')
  })
})

describe('snapshot: AuditLogRow', () => {
  it('renders action badge, actor name, date and resource', () => {
    const row = makeRow({})
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))

    // Action badge resolves through ACTION_OPTIONS; "login" → "登录".
    expect(html).toContain('登录')

    // Actor name renders verbatim when present.
    expect(html).toContain('雨帆')

    // Actor role badge resolves through roleLabel; "admin" → 管理员.
    expect(html).toContain('管理员')

    // Localised timestamp (Asia/Shanghai = UTC+8 → 10:30:00).
    expect(html).toContain('2024-01-15 10:30:00')

    // Masked IP and resource-type label render in the meta line. React
    // SSR emits a `<!-- -->` marker between the literal prefix and the
    // dynamic value, so assert each segment separately.
    expect(html).toContain('IP:')
    expect(html).toContain('203.0.113.*')
    expect(html).toContain('会话')
  })

  it('falls back to actor id when name is null', () => {
    const row = makeRow({ actorName: null, actorId: 'user-42' })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    // React SSR inserts a `<!-- -->` marker between "ID:" and the id,
    // so assert each segment separately.
    expect(html).toContain('ID:')
    expect(html).toContain('user-42')
  })

  it('falls back to an em-dash when both actor id and name are null', () => {
    const row = makeRow({ actorName: null, actorId: null })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    expect(html).toContain('—')
  })

  it('renders the resource id suffix when present', () => {
    const row = makeRow({ resourceType: 'post', resourceId: '128' })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    expect(html).toContain('文章')
    // React SSR splits "#" and the id with a `<!-- -->` marker.
    expect(html).toContain('#')
    expect(html).toContain('128')
  })

  it('exposes an expand affordance when details are present', () => {
    const row = makeRow({ details: { foo: 'bar' } })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    // Expandable rows surface role="button" + aria-expanded to AT users.
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('展开详情')
  })

  it('renders a non-expandable row without details', () => {
    const row = makeRow({ details: null })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    // No interactive affordance when there is nothing to expand.
    expect(html).not.toContain('role="button"')
    expect(html).toContain('无详情数据')
  })
})

describe('snapshot: AuditLogFilterPill', () => {
  it('renders an action-type pill with the resolved option label', () => {
    const fields = buildAuditFilterFields(ACTORS)
    const filter: ActiveFilter<AuditLogFilterFieldKey> = { field: 'action', value: 'login', label: '登录' }
    const html = stableHtml(
      renderToHtml(
        <FilterPill
          field={fields.find((f) => f.key === filter.field)}
          filter={filter}
          search={{}}
          onRemove={() => {}}
          onValueChange={() => {}}
        />,
      ),
    )
    // Field label comes from the field specs; the value label resolves via
    // ACTION_OPTIONS.
    expect(html).toContain('操作类型')
    expect(html).toContain('登录')
    // The remove (x) button is always emitted.
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders an ip-type pill with a text input editor', () => {
    const fields = buildAuditFilterFields(ACTORS)
    const filter: ActiveFilter<AuditLogFilterFieldKey> = { field: 'ip', value: '203.0.113', label: 'IP' }
    const html = stableHtml(
      renderToHtml(
        <FilterPill
          field={fields.find((f) => f.key === filter.field)}
          filter={filter}
          search={{}}
          onRemove={() => {}}
          onValueChange={() => {}}
        />,
      ),
    )
    expect(html).toContain('IP')
    expect(html).toContain('<input')
    expect(html).toContain('203.0.113')
  })

  it('renders a resource-type pill with the resource label', () => {
    const fields = buildAuditFilterFields(ACTORS)
    const filter: ActiveFilter<AuditLogFilterFieldKey> = { field: 'resourceType', value: 'post', label: '文章' }
    const html = stableHtml(
      renderToHtml(
        <FilterPill
          field={fields.find((f) => f.key === filter.field)}
          filter={filter}
          search={{}}
          onRemove={() => {}}
          onValueChange={() => {}}
        />,
      ),
    )
    expect(html).toContain('资源类型')
    expect(html).toContain('文章')
  })
})

describe('snapshot: AuditLogFilterAddButton', () => {
  it('renders the bare "筛选" trigger when no filters are active', () => {
    const html = stableHtml(
      renderToHtml(
        <FilterAddButton fields={buildAuditFilterFields(ACTORS)} filters={[]} search={{}} onAddFilter={() => {}} />,
      ),
    )
    // Empty-state label is "筛选" — "添加筛选" only appears once a
    // filter is active.
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
    // Trigger is a real button.
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders the "添加筛选" trigger once at least one filter is active', () => {
    const filters: ActiveFilter<AuditLogFilterFieldKey>[] = [{ field: 'action', value: 'login', label: '登录' }]
    const html = stableHtml(
      renderToHtml(
        <FilterAddButton
          fields={buildAuditFilterFields(ACTORS)}
          filters={filters}
          search={{}}
          onAddFilter={() => {}}
        />,
      ),
    )
    expect(html).toContain('添加筛选')
  })
})
