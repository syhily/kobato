import { describe, expect, it, vi } from 'vitest'

import {
  type DetailEtagInput,
  type RepresentationFingerprint,
  contentEtag,
  etagHeaderMatches,
  listingEtag,
  listingCalendarDay,
  listingRepresentation,
  notModifiedResponse,
  pageEtag,
  postEtag,
  representationFromLocalization,
  weakEtag,
} from '@/server/infra/http/etag'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

describe('server/infra/http/etag — weakEtag', () => {
  it('returns a weak-etag-prefixed 16-char hex digest', () => {
    const tag = weakEtag(['a', 1])
    expect(tag).toMatch(/^W\/"[0-9a-f]{16}"$/)
  })

  it('is deterministic for the same parts', () => {
    expect(weakEtag(['a', 1])).toBe(weakEtag(['a', 1]))
  })

  it('changes when a part changes', () => {
    expect(weakEtag(['a', 1])).not.toBe(weakEtag(['a', 2]))
  })

  it('does not collide across part boundaries', () => {
    expect(weakEtag(['ab', 'c'])).not.toBe(weakEtag(['a', 'bc']))
  })

  it('serialises Dates via toISOString and treats null/undefined as empty', () => {
    const date = new Date('2025-01-01T00:00:00.000Z')
    expect(weakEtag([date, null, undefined])).toBe(weakEtag([date, '', '']))
  })
})

describe('server/infra/http/etag — request localization', () => {
  const REVISIONS = { ...representationRevisionsFor(null), detail: 'boot-test:0000000007' }

  it('projects locale, zone, display format and the DETAIL revision from the request', () => {
    expect(
      representationFromLocalization({
        locale: 'zh-TW',
        timeZone: 'Asia/Taipei',
        timeFormat: 'yyyy-LL-dd',
        revision: 'boot-test:process-identity',
        revisions: REVISIONS,
      }),
    ).toMatchObject({
      locale: 'zh-TW',
      timeZone: 'Asia/Taipei',
      timeFormat: 'yyyy-LL-dd',
      // Never the process token — only the page-shell generation keys the ETag.
      revision: 'boot-test:0000000007',
    })
  })

  it('normalises the site default display format (`null`) to `auto`', () => {
    const representation = representationFromLocalization({
      locale: 'en-US',
      timeZone: 'UTC',
      timeFormat: null,
      revision: 'boot-test:process-identity',
      revisions: REVISIONS,
    })
    expect(representation.timeFormat).toBe('auto')
    expect(representation.revision).toBe('boot-test:0000000007')
  })
})

const BASE_REPRESENTATION: RepresentationFingerprint = {
  version: '1.0.0',
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-LL-dd HH:mm',
  revision: 'boot-test:0000000003',
}

const BASE_PAYLOAD = {
  post: { id: '7', title: 'Hello', date: new Date('2024-01-02T03:04:05.000Z') },
  bodyHtml: '<p>body</p>',
  visibleTags: [{ name: 'tag', slug: 'tag', counts: 1 }],
  sidebarPosts: [{ title: 'Recent', permalink: '/posts/recent' }],
  tags: [{ name: 'tag', slug: 'tag', counts: 1 }],
  draftMarker: null,
  critical: { commentKey: 'key-1', likes: 2, recentComments: [] },
}

const BASE_INPUT: DetailEtagInput = {
  id: 7,
  publishedRevisionId: 11,
  publishedAt: new Date('2024-01-02T03:04:05.000Z'),
  representation: BASE_REPRESENTATION,
  payload: BASE_PAYLOAD,
}

describe('server/infra/http/etag — detail payload fingerprint', () => {
  it('is stable for an identical representation across BOTH builders and id spellings', () => {
    expect(postEtag(BASE_INPUT)).toBe(postEtag({ ...BASE_INPUT }))
    expect(pageEtag(BASE_INPUT)).toBe(pageEtag({ ...BASE_INPUT }))
    expect(postEtag({ ...BASE_INPUT, id: '7' })).toBe(postEtag(BASE_INPUT))
    expect(pageEtag({ ...BASE_INPUT, publishedRevisionId: '11' })).toBe(pageEtag(BASE_INPUT))
  })

  it('does not depend on object key insertion order', () => {
    const reordered = {
      critical: BASE_PAYLOAD.critical,
      draftMarker: BASE_PAYLOAD.draftMarker,
      tags: BASE_PAYLOAD.tags,
      sidebarPosts: BASE_PAYLOAD.sidebarPosts,
      visibleTags: BASE_PAYLOAD.visibleTags,
      bodyHtml: BASE_PAYLOAD.bodyHtml,
      post: BASE_PAYLOAD.post,
    }
    expect(postEtag({ ...BASE_INPUT, payload: reordered })).toBe(postEtag(BASE_INPUT))
  })

  it('changes for each representation dimension on BOTH builders', () => {
    const variants: RepresentationFingerprint[] = [
      { ...BASE_REPRESENTATION, version: '1.0.1' },
      { ...BASE_REPRESENTATION, locale: 'en-US' },
      { ...BASE_REPRESENTATION, timeZone: 'America/New_York' },
      { ...BASE_REPRESENTATION, timeFormat: 'auto' },
      { ...BASE_REPRESENTATION, revision: 'boot-test:0000000004' },
    ]
    for (const representation of variants) {
      const input = { ...BASE_INPUT, representation }
      expect(postEtag(input)).not.toBe(postEtag(BASE_INPUT))
      expect(pageEtag(input)).not.toBe(pageEtag(BASE_INPUT))
    }
  })

  it('changes with the published revision and instant', () => {
    expect(postEtag({ ...BASE_INPUT, publishedRevisionId: 12 })).not.toBe(postEtag(BASE_INPUT))
    expect(postEtag({ ...BASE_INPUT, publishedAt: new Date('2024-06-01T00:00:00.000Z') })).not.toBe(
      postEtag(BASE_INPUT),
    )
  })

  it('covers every payload field: body, tags, sidebar and the interaction critical', () => {
    const variants = [
      { ...BASE_PAYLOAD, bodyHtml: '<p>other</p>' },
      { ...BASE_PAYLOAD, visibleTags: [] },
      { ...BASE_PAYLOAD, tags: [] },
      { ...BASE_PAYLOAD, sidebarPosts: [] },
      { ...BASE_PAYLOAD, critical: { ...BASE_PAYLOAD.critical, likes: 3 } },
      { ...BASE_PAYLOAD, critical: { ...BASE_PAYLOAD.critical, commentKey: 'key-2' } },
      {
        ...BASE_PAYLOAD,
        critical: {
          ...BASE_PAYLOAD.critical,
          recentComments: [{ id: '1', author: 'a', contentHtml: 'hi' }],
        },
      },
      { ...BASE_PAYLOAD, post: { ...BASE_PAYLOAD.post, title: 'Changed' } },
      { ...BASE_PAYLOAD, draftMarker: 'published-draft' },
    ]
    for (const payload of variants) {
      expect(postEtag({ ...BASE_INPUT, payload })).not.toBe(postEtag(BASE_INPUT))
      expect(pageEtag({ ...BASE_INPUT, payload })).not.toBe(pageEtag(BASE_INPUT))
    }
  })
})

describe('server/infra/http/etag — notModifiedResponse', () => {
  it('carries the request localization as Content-Language plus the detail Cache-Control profile', () => {
    const tag = 'W/"abc"'
    const res = notModifiedResponse(tag, {
      locale: 'zh-TW',
      timeZone: 'Asia/Taipei',
      timeFormat: 'yyyy-LL-dd',
      revision: 'boot-test:process-identity',
      revisions: { ...representationRevisionsFor(null), detail: 'boot-test:0000000009' },
    })
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(tag)
    expect(res.headers.get('Content-Language')).toBe('zh-TW')
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(res.headers.get('Vary')).toBe('Cookie')
  })

  it('uses the LISTING profile for a listing 304 (same no-cache value, explicit profile)', () => {
    const res = notModifiedResponse(
      'W/"listing"',
      {
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'yyyy-MM-dd',
        revision: 'boot-test:process-identity',
        revisions: representationRevisionsFor(null),
      },
      'listing',
    )
    expect(res.status).toBe(304)
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
  })
})

describe('server/infra/http/etag — listing payload fingerprint', () => {
  const LISTING = {
    pageNum: 2,
    totalPage: 3,
    rootPath: '/tags/react',
    resolvedPosts: [{ slug: 'post-1', title: 'One' }],
    seo: [{ tagName: 'link', rel: 'canonical', href: '/tags/react/page/2' }],
    extra: { sidebar: { posts: ['a'], tags: ['b'] } },
    listingNowIso: '2026-11-08T04:00:00.000Z',
  }
  const DAY = '2026-11-08'
  const REPRESENTATION = listingRepresentation({
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-MM-dd',
    revision: 'boot-test:process-identity',
    revisions: { ...representationRevisionsFor(null), listing: 'listing-generation-1' },
  })

  it('keys on the LISTING revision, not the process token or the detail one', () => {
    const revisions = representationRevisionsFor(null)
    const base = {
      locale: 'zh-CN' as const,
      timeZone: 'Asia/Shanghai',
      timeFormat: 'yyyy-MM-dd',
      revision: 'process-a',
    }
    expect(listingRepresentation({ ...base, revisions }).revision).toBe(revisions.listing)
    expect(listingRepresentation({ ...base, revisions: { ...revisions, detail: 'detail-only' } }).revision).toBe(
      revisions.listing,
    )
    expect(listingRepresentation({ ...base, revisions: { ...revisions, listing: 'listing-next' } }).revision).toBe(
      'listing-next',
    )
  })

  it('is stable for an identical representation and does not depend on key order', () => {
    const reordered = {
      listingNowIso: LISTING.listingNowIso,
      extra: LISTING.extra,
      seo: LISTING.seo,
      resolvedPosts: LISTING.resolvedPosts,
      rootPath: LISTING.rootPath,
      totalPage: LISTING.totalPage,
      pageNum: LISTING.pageNum,
    }
    expect(listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: DAY })).toBe(
      listingEtag({ representation: REPRESENTATION, payload: reordered, calendarDay: DAY }),
    )
  })

  it('ignores the per-request listingNowIso instant but rotates with the calendar day', () => {
    const laterInstant = { ...LISTING, listingNowIso: '2026-11-08T15:59:00.000Z' }
    expect(listingEtag({ representation: REPRESENTATION, payload: laterInstant, calendarDay: DAY })).toBe(
      listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: DAY }),
    )
    expect(listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: '2026-11-09' })).not.toBe(
      listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: DAY }),
    )
  })

  it('covers every payload part: page slice, pagination, SEO and the extra/sidebar slot', () => {
    const variants = [
      { ...LISTING, pageNum: 1 },
      { ...LISTING, totalPage: 4 },
      { ...LISTING, rootPath: '/cats/react' },
      { ...LISTING, resolvedPosts: [{ slug: 'post-2', title: 'Two' }] },
      { ...LISTING, seo: [] },
      { ...LISTING, extra: { sidebar: { posts: ['a'], tags: ['c'] } } },
      { ...LISTING, extra: undefined },
    ]
    for (const payload of variants) {
      expect(listingEtag({ representation: REPRESENTATION, payload, calendarDay: DAY })).not.toBe(
        listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: DAY }),
      )
    }
  })

  it('changes with locale, display format, app version and the listing generation', () => {
    const variants: RepresentationFingerprint[] = [
      { ...REPRESENTATION, version: '9.9.9' },
      { ...REPRESENTATION, locale: 'en-US' },
      { ...REPRESENTATION, timeZone: 'America/New_York' },
      { ...REPRESENTATION, timeFormat: 'auto' },
      { ...REPRESENTATION, revision: 'listing-generation-2' },
    ]
    for (const representation of variants) {
      expect(listingEtag({ representation, payload: LISTING, calendarDay: DAY })).not.toBe(
        listingEtag({ representation: REPRESENTATION, payload: LISTING, calendarDay: DAY }),
      )
    }
  })
})

describe('server/infra/http/etag — listing calendar day', () => {
  const LOCALIZATION = {
    locale: 'zh-CN' as const,
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-MM-dd',
    revision: 'boot-test:process-identity',
    revisions: representationRevisionsFor(null),
  }

  it("buckets by the payload's own instant, so a site-midnight crossing cannot split body and tag", () => {
    // 15:59:59Z / 16:00:01Z are 23:59:59 / 00:00:01 in Asia/Shanghai.
    expect(listingCalendarDay({ listingNowIso: '2026-11-08T15:59:59.000Z' }, LOCALIZATION)).toBe('2026-11-08')
    expect(listingCalendarDay({ listingNowIso: '2026-11-08T16:00:01.000Z' }, LOCALIZATION)).toBe('2026-11-09')
    // Same instants in UTC sit on the same day — the bucket follows the SITE zone.
    expect(
      listingCalendarDay({ listingNowIso: '2026-11-08T16:00:01.000Z' }, { ...LOCALIZATION, timeZone: 'UTC' }),
    ).toBe('2026-11-08')
  })

  it('falls back to now for payloads without an instant (categories)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-11-08T04:00:00.000Z')) // 12:00 Shanghai
      expect(listingCalendarDay({ categories: [] }, LOCALIZATION)).toBe('2026-11-08')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('server/infra/http/etag — contentEtag', () => {
  it('is a strong tag over the exact bytes and is stable for the same bytes', () => {
    const tag = contentEtag('<rss>same</rss>')
    expect(tag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(contentEtag('<rss>same</rss>')).toBe(tag)
    expect(contentEtag(Buffer.from('<rss>same</rss>'))).toBe(tag)
    expect(contentEtag('<rss>other</rss>')).not.toBe(tag)
  })
})

describe('server/infra/http/etag — etagHeaderMatches', () => {
  const tag = contentEtag('body')

  it('matches an exact tag and a comma-separated list', () => {
    expect(etagHeaderMatches(tag, tag)).toBe(true)
    expect(etagHeaderMatches(`"other", ${tag}`, tag)).toBe(true)
    expect(etagHeaderMatches(`"other"`, tag)).toBe(false)
    expect(etagHeaderMatches(null, tag)).toBe(false)
    expect(etagHeaderMatches('', tag)).toBe(false)
  })

  it('accepts the wildcard and performs the weak comparison RFC 9110 specifies', () => {
    expect(etagHeaderMatches('*', tag)).toBe(true)
    expect(etagHeaderMatches(`W/${tag}`, tag)).toBe(true)
    expect(etagHeaderMatches(tag, `W/${tag}`)).toBe(true)
  })
})
