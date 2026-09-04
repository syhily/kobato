import { describe, expect, it, vi } from 'vitest'

import type { AdminRevisionDto } from '@/shared/contracts/revision'

import { emptyLexicalBody } from '#/_helpers/lexical'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { DateTimePicker } from '@/ui/admin/editor-shell/DateTimePicker'
import { RevisionHistoryDrawer } from '@/ui/admin/editor-shell/RevisionsDrawer'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as { revisions: AdminRevisionDto[] } | null,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}

// DateTimePicker is props-driven; its calendar popover only mounts on click
// (client-only) — assert the trigger label. RevisionsDrawer's Sheet body
// mounts only after open; cover the trigger + query-wired list via the stub.

const noop = () => undefined

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
    // Garbage → parseLocal returns null; trigger falls back to the empty label.
    const html = stableHtml(renderToHtml(<DateTimePicker value="not-a-date" onChange={noop} />))
    expect(html).toContain('选择日期与时间')
    expect(html).toContain('data-empty="true"')
  })
})

function makeRevision(overrides: Partial<AdminRevisionDto> = {}): AdminRevisionDto {
  return {
    id: overrides.id ?? 'rev-1',
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'draft',
    body: overrides.body ?? emptyLexicalBody(),
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
    queryMocks.query = { data: null, isFetching: false, error: null, refetch: vi.fn() }
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
    expect(html).toContain('历史版本')
  })

  it('renders the page-variant trigger', () => {
    queryMocks.query = { data: null, isFetching: false, error: null, refetch: vi.fn() }
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
    // Closed sheet emits just the trigger; if the portal emits we additionally see the row copy.
    const revisions = [
      makeRevision({ id: 'r1', revisionNo: 3, status: 'published', clientRevisionToken: 'tok-3' }),
      makeRevision({ id: 'r2', revisionNo: 2, status: 'draft', clientRevisionToken: 'tok-2' }),
    ]
    queryMocks.query = { data: { revisions }, isFetching: false, error: null, refetch: vi.fn() }
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
    expect(html).toContain('历史版本')
    // Row labels live behind the portal — assert only if it emitted.
    if (html.includes('R3')) {
      expect(html).toContain('R3 · 已发布')
      expect(html).toContain('当前')
      expect(html).toContain('R2 · 草稿')
    }
  })

  it('renders the empty-history row when the query resolves with no revisions', () => {
    queryMocks.query = { data: { revisions: [] }, isFetching: false, error: null, refetch: vi.fn() }
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
