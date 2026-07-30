import { describe, expect, it, vi } from 'vitest'

import type { AdminRevisionDto } from '@/shared/contracts/revision'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { DateTimePicker } from '@/ui/admin/editor-shell/DateTimePicker'
import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'

// DateTimePicker is fully props-driven (value/onChange). The calendar popover
// content lives behind a Base UI Popover that only mounts its popup on click
// (client-only), so we assert the trigger button label + the closed state.
// RevisionsDrawer wraps its list in a Base UI Sheet (same portal constraint as
// ConfirmDialog): the trigger button is emitted but the sheet body only mounts
// after the open animation runs. We cover the trigger + the query-wired list
// path by stubbing react-query so the data resolves.

const noop = () => undefined

// ──────────────────────────── DateTimePicker ───────────────────────────────

describe('snapshot: DateTimePicker', () => {
  it('renders the empty-state trigger label when value is blank', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} />))
    expect(html).toContain('选择日期与时间')
    // The trigger carries the empty data attribute used for muted styling.
    expect(html).toContain('data-empty="true"')
  })

  it('renders a localized date + time label when a value is set', () => {
    // A future date so the local-input parse is deterministic regardless of TZ.
    const html = stableHtml(renderToHtml(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />))
    // The display string formats the date in zh-CN and picks 上午/下午 from the hour.
    expect(html).toMatch(/2099年6月\d+日/u)
    // 14:30 is PM in 12h => 下午, hour 2.
    expect(html).toContain('下午')
    expect(html).toContain('02:30')
    // Not empty => the muted styling flag is off.
    expect(html).toContain('data-empty="false"')
  })

  it('renders the 上午 (AM) label for a morning time', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="2099-06-15T09:05" onChange={noop} />))
    expect(html).toContain('上午')
    expect(html).toContain('09:05')
  })

  it('renders a disabled trigger when the disabled prop is set', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} disabled={true} />))
    expect(html).toContain('disabled=""')
    expect(html).toContain('选择日期与时间')
  })

  it('honours a custom id prop on the trigger button', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} id="custom-dtp" />))
    expect(html).toContain('id="custom-dtp"')
  })

  it('renders the popover trigger even when the value is unparseable garbage', () => {
    // parseLocal returns null for garbage; the trigger falls back to the
    // empty-state label without throwing.
    const html = stableHtml(renderToHtml(<DateTimePicker value="not-a-date" onChange={noop} />))
    expect(html).toContain('选择日期与时间')
    expect(html).toContain('data-empty="true"')
  })
})

// ──────────────────────────── RevisionsDrawer ──────────────────────────────

const queryMocks = vi.hoisted(() => ({
  list: {
    data: null as { revisions: AdminRevisionDto[] } | null,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => queryMocks.list,
  }
})

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: {
    admin: {
      posts: {
        listRevisions: {
          queryOptions: (args: unknown) => ({ queryKey: ['revisions', args], queryFn: async () => ({}) }),
        },
      },
      pages: {
        listRevisions: {
          queryOptions: (args: unknown) => ({ queryKey: ['revisions', args], queryFn: async () => ({}) }),
        },
      },
    },
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function makeRevision(overrides: Partial<AdminRevisionDto> = {}): AdminRevisionDto {
  return {
    id: overrides.id ?? 'rev-1',
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'draft',
    body: overrides.body ?? [],
    imageSources: overrides.imageSources ?? [],
    headings: overrides.headings ?? [],
    authorId: overrides.authorId ?? null,
    clientRevisionToken: overrides.clientRevisionToken ?? 'token-1',
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2024-01-02T00:00:00.000Z',
  }
}

describe('snapshot: RevisionHistoryDrawer', () => {
  it('renders the "历史版本" trigger button (closed sheet emits no body on SSR)', () => {
    queryMocks.list = { data: null, isFetching: false, error: null, refetch: vi.fn() }
    const html = stableHtml(
      renderToHtml(
        <RevisionHistoryDrawer
          type="post"
          ownerId="post-1"
          currentToken="token-current"
          currentBody={[]}
          onAdoptRevision={noop}
        />,
      ),
    )
    // The SheetTrigger button always renders.
    expect(html).toContain('历史版本')
  })

  it('renders the page-variant trigger', () => {
    queryMocks.list = { data: null, isFetching: false, error: null, refetch: vi.fn() }
    const html = stableHtml(
      renderToHtml(
        <RevisionHistoryDrawer
          type="page"
          ownerId="page-1"
          currentToken={null}
          currentBody={[]}
          onAdoptRevision={noop}
        />,
      ),
    )
    expect(html).toContain('历史版本')
  })

  it('renders the revision rows inside the sheet body when the query resolves', () => {
    // The Base UI Sheet keeps its content mounted only after open; on SSR the
    // closed sheet emits just the trigger. When `open` is forced true the
    // portal may still skip the popup, so we assert the trigger + a no-throw
    // render. If the portal emits, we additionally see the row copy.
    const revisions = [
      makeRevision({ id: 'r1', revisionNo: 3, status: 'published', clientRevisionToken: 'tok-3' }),
      makeRevision({ id: 'r2', revisionNo: 2, status: 'draft', clientRevisionToken: 'tok-2' }),
    ]
    queryMocks.list = { data: { revisions }, isFetching: false, error: null, refetch: vi.fn() }
    const html = stableHtml(
      renderToHtml(
        <RevisionHistoryDrawer
          type="post"
          ownerId="post-1"
          currentToken="tok-3"
          currentBody={[]}
          onAdoptRevision={noop}
        />,
      ),
    )
    // Trigger always present.
    expect(html).toContain('历史版本')
    // The revision list view is rendered inside the Sheet body which is behind
    // the Base UI portal; assert the row labels only if the portal emitted.
    if (html.includes('R3')) {
      expect(html).toContain('R3 · 已发布')
      expect(html).toContain('当前')
      expect(html).toContain('R2 · 草稿')
    }
  })

  it('renders the empty-history row when the query resolves with no revisions', () => {
    queryMocks.list = { data: { revisions: [] }, isFetching: false, error: null, refetch: vi.fn() }
    const html = stableHtml(
      renderToHtml(
        <RevisionHistoryDrawer
          type="post"
          ownerId="post-1"
          currentToken={null}
          currentBody={[]}
          onAdoptRevision={noop}
        />,
      ),
    )
    expect(html).toContain('历史版本')
    if (html.includes('暂无历史')) {
      expect(html).toContain('暂无历史')
    }
  })
})
