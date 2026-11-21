import type { AdminRevisionDto } from '@kobato/contracts/revision.ts'

import { emptyLexicalBody } from '@kobato/inkling/tests/utils/lexical.ts'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { RevisionHistoryDrawer } from '@kobato/web-admin/ui/editor-shell/RevisionsDrawer.tsx'
import { renderToHtml, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.query = {
  data: null as { revisions: AdminRevisionDto[] } | null,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}

const noop = () => undefined

describe('snapshot: RevisionHistoryDrawer', () => {
  it('renders the "历史版本" trigger button (closed sheet emits no body on SSR)', () => {
    queryMocks.query = { data: null, isFetching: false, error: null, refetch: vi.fn() }
    const html = stableHtml(
      renderToHtml(
        <RevisionHistoryDrawer
          type="post"
          ownerId="post-1"
          currentToken="token-current"
          currentBody={emptyLexicalBody()}
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
          currentBody={emptyLexicalBody()}
          onAdoptRevision={noop}
        />,
      ),
    )
    expect(html).toContain('历史版本')
  })

  it('renders the revision rows inside the sheet body when the query resolves', () => {
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
          currentBody={emptyLexicalBody()}
          onAdoptRevision={noop}
        />,
      ),
    )
    expect(html).toContain('历史版本')
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
          currentBody={emptyLexicalBody()}
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
