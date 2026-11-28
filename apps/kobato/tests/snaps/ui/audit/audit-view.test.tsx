import type { AuditLogActorDto, AuditLogItemDto } from '@kobato/api/contracts/admin/audit'

import { tZhCN } from '@kobato/i18n/tests/utils/i18n'
import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditLogFilterFieldKey } from '@/ui/audit/filter-fields'
import type { ActiveFilter } from '@/ui/shared/filter-bar/filter-pills-reducer'

import { AuditLogRow } from '@/ui/audit/AuditLogRow'
import { AuditLogView } from '@/ui/audit/AuditLogView'
import { buildAuditFilterFields } from '@/ui/audit/filter-fields'
import { FilterAddButton } from '@/ui/shared/filter-bar/add-button'
import { FilterPill } from '@/ui/shared/filter-bar/pill'

const queryMocks = mockTanstackQuery()

queryMocks.infinite = {
  data: undefined as { pages: { items: AuditLogItemDto[]; total: number; hasMore: boolean }[] } | undefined,
  isLoading: false,
  error: null as Error | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}

queryMocks.query = {
  data: undefined as AuditLogActorDto[] | undefined,
}

queryMocks.mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}

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
    const html = stableHtml(renderInRouter(<AuditLogView retentionDays={90} />, '/admin/security/audit-log'))

    expect(html).toContain('审计日志')
    expect(html).toContain('90')

    expect(html).toContain('筛选')

    expect(html).toContain('导出 CSV')
    expect(html).toMatch(/<button[^>]*>/)

    expect(html).toContain('暂无审计日志记录')
  })
})

describe('snapshot: AuditLogRow', () => {
  it('renders action badge, actor name, date and resource', () => {
    const row = makeRow({})
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))

    expect(html).toContain('登录')

    expect(html).toContain('雨帆')

    expect(html).toContain('管理员')

    expect(html).toContain('2024-01-15 10:30:00')

    expect(html).toContain('IP:')
    expect(html).toContain('203.0.113.*')
    expect(html).toContain('会话')
  })

  it('falls back to actor id when name is null', () => {
    const row = makeRow({ actorName: null, actorId: 'user-42' })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
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
    expect(html).toContain('#')
    expect(html).toContain('128')
  })

  it('exposes an expand affordance when details are present', () => {
    const row = makeRow({ details: { foo: 'bar' } })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('展开详情')
  })

  it('renders a non-expandable row without details', () => {
    const row = makeRow({ details: null })
    const html = stableHtml(renderToHtml(<AuditLogRow row={row} />))
    expect(html).not.toContain('role="button"')
    expect(html).toContain('无详情数据')
  })
})

describe('snapshot: AuditLogFilterPill', () => {
  it('renders an action-type pill with the resolved option label', () => {
    const fields = buildAuditFilterFields(ACTORS, tZhCN)
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
    expect(html).toContain('操作类型')
    expect(html).toContain('登录')
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders an ip-type pill with a text input editor', () => {
    const fields = buildAuditFilterFields(ACTORS, tZhCN)
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
    const fields = buildAuditFilterFields(ACTORS, tZhCN)
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
        <FilterAddButton
          fields={buildAuditFilterFields(ACTORS, tZhCN)}
          filters={[]}
          search={{}}
          onAddFilter={() => {}}
        />,
      ),
    )
    expect(html).toContain('筛选')
    expect(html).not.toContain('添加筛选')
    expect(html).toMatch(/<button[^>]*>/)
  })

  it('renders the "添加筛选" trigger once at least one filter is active', () => {
    const filters: ActiveFilter<AuditLogFilterFieldKey>[] = [{ field: 'action', value: 'login', label: '登录' }]
    const html = stableHtml(
      renderToHtml(
        <FilterAddButton
          fields={buildAuditFilterFields(ACTORS, tZhCN)}
          filters={filters}
          search={{}}
          onAddFilter={() => {}}
        />,
      ),
    )
    expect(html).toContain('添加筛选')
  })
})
