import { describe, expect, it } from 'vitest'

import type { ContentRow, PageMetaRow } from '@/server/infra/db/types'

// Projection-layer unit tests. These run without any mocks because
// the projection module is pure data shaping — it accepts already-fetched
// rows and produces the public/admin DTOs. The tests pin two contracts:
//
//   1. `toCmsPage` / `toAdminRevisionDto` reject malformed `body` payloads
//      via `validatePortableTextBody` (defence-in-depth so a future direct
//      INSERT can't blank the public site).
//   2. The DTO field shape stays stable (id stringification, ISO dates).

const { toAdminRevisionDto, toCmsPage } = await import('@/server/domains/pages/projection')

function metaRow(overrides: Partial<PageMetaRow> = {}): PageMetaRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 1n,
    slug: overrides.slug ?? 'about',
    title: overrides.title ?? '关于我',
    summary: overrides.summary ?? '',
    cover: overrides.cover ?? '',
    og: overrides.og ?? null,
    published: overrides.published ?? true,
    commentsEnabled: overrides.commentsEnabled ?? true,
    showToc: overrides.showToc ?? false,
    showUpdated: overrides.showUpdated ?? false,
    showFriends: overrides.showFriends ?? false,
    publishedAt: overrides.publishedAt ?? now,
    publishedRevisionId: overrides.publishedRevisionId ?? null,
    firstPublishedAt: overrides.firstPublishedAt ?? null,
    authorId: overrides.authorId ?? null,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  }
}

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  const now = overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 100n,
    type: overrides.type ?? 'page',
    ownerId: overrides.ownerId ?? 1n,
    revisionNo: overrides.revisionNo ?? 1,
    status: overrides.status ?? 'draft',
    body: overrides.body ?? [],
    imageSources: overrides.imageSources ?? [],
    headings: overrides.headings ?? [],
    authorId: overrides.authorId ?? null,
    clientRevisionToken: overrides.clientRevisionToken ?? '00000000-0000-0000-0000-000000000001',
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

describe('cms/pages/projection — toCmsPage', () => {
  it('returns an empty body when there is no published revision', () => {
    const dto = toCmsPage(metaRow({ id: 1n, publishedRevisionId: null }), null)
    expect(dto.body).toEqual([])
    expect(dto.imageSources).toEqual([])
    expect(dto.headings).toEqual([])
    expect(dto.publishedRevisionId).toBeNull()
    expect(dto.permalink).toBe('/about')
  })

  it('joins the published revision body when present', () => {
    const body = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Hi' }],
      },
    ]
    const dto = toCmsPage(
      metaRow({ id: 1n, publishedRevisionId: 200n }),
      contentRow({
        id: 200n,
        body,
        imageSources: ['images/x.jpg'],
        headings: [{ depth: 2, text: 'Hi', slug: 'hi' }],
      }),
    )
    expect(dto.body).toEqual(body)
    expect(dto.imageSources).toEqual(['images/x.jpg'])
    expect(dto.headings).toEqual([{ depth: 2, text: 'Hi', slug: 'hi' }])
    expect(dto.publishedRevisionId).toBe(200n)
  })

  it('throws on a malformed jsonb body that bypassed the API perimeter', () => {
    expect(() =>
      toCmsPage(
        metaRow({ id: 1n, publishedRevisionId: 200n }),
        contentRow({ id: 200n, body: [{ _type: 'unknown_block', payload: 'foo' }] }),
      ),
    ).toThrow()
  })

  it('treats malformed imageSources as []', () => {
    const dto = toCmsPage(
      metaRow({ id: 1n, publishedRevisionId: 200n }),
      contentRow({
        id: 200n,
        body: [],
        imageSources: ['ok.jpg', 42, null] as unknown as ContentRow['imageSources'],
      }),
    )
    expect(dto.imageSources).toEqual(['ok.jpg'])
  })

  it('treats malformed headings entries as skipped without failing the projection', () => {
    const dto = toCmsPage(
      metaRow({ id: 1n, publishedRevisionId: 200n }),
      contentRow({
        id: 200n,
        body: [],
        headings: [
          { depth: 2, text: 'ok', slug: 'ok' },
          { depth: 'two', text: 'x' },
          null,
        ] as unknown as ContentRow['headings'],
      }),
    )
    expect(dto.headings).toEqual([{ depth: 2, text: 'ok', slug: 'ok' }])
  })
})

describe('cms/pages/projection — toAdminRevisionDto', () => {
  it('stringifies bigint ids and ISO-encodes timestamps', () => {
    const dto = toAdminRevisionDto(
      contentRow({
        id: 12345n,
        revisionNo: 7,
        status: 'published',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'Hi' }],
          },
        ],
        authorId: 99n,
      }),
    )
    expect(dto.id).toBe('12345')
    expect(dto.revisionNo).toBe(7)
    expect(dto.status).toBe('published')
    expect(dto.authorId).toBe('99')
    expect(typeof dto.createdAt).toBe('string')
    expect(dto.createdAt.endsWith('Z')).toBe(true)
  })

  it('throws on malformed body so the editor never hydrates with garbage', () => {
    expect(() =>
      toAdminRevisionDto(contentRow({ body: [{ _type: 'block' }] as unknown as ContentRow['body'] })),
    ).toThrow()
  })

  it('coalesces unknown statuses to draft (defensive)', () => {
    const dto = toAdminRevisionDto(contentRow({ status: 'somethingElse' as unknown as ContentRow['status'], body: [] }))
    expect(dto.status).toBe('draft')
  })
})
