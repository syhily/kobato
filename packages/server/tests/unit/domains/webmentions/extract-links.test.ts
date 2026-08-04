import type { PortableTextBody } from '@kobato/shared/legacy-pt/schema'

import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { extractExternalLinks, MAX_OUTBOUND_LINKS_PER_POST } from '@kobato/server/domains/webmentions/enqueue'
import { describe, expect, it } from 'vitest'

// The extractor walks the canonical Lexical shape; fixtures stay in the
// PT form and convert through the one-way mapping (migration source).
const toLex = (body: PortableTextBody) => convertPtBodyToLexical(body)

const SITE_HOST = 'example.com'

function textBlock(key: string, links: { key: string; href: string }[], text = 'body') {
  return {
    _type: 'block' as const,
    _key: key,
    style: 'normal' as const,
    markDefs: links.map((l) => ({ _type: 'link' as const, _key: l.key, href: l.href })),
    // One span per link — the one-way mapping keeps only the FIRST link
    // markDef of a span, so multi-link fixtures must split spans.
    children:
      links.length > 0
        ? links.map((l) => ({ _type: 'span' as const, _key: `${key}-s-${l.key}`, text, marks: [l.key] }))
        : [{ _type: 'span' as const, _key: `${key}-s`, text, marks: [] }],
  }
}

describe('webmentions/enqueue.extractExternalLinks', () => {
  it('extracts link markDef hrefs across blocks', () => {
    const body: PortableTextBody = [
      textBlock('b1', [{ key: 'l1', href: 'https://a.dev/one' }]),
      textBlock('b2', [{ key: 'l2', href: 'https://b.dev/two' }]),
    ]
    expect(extractExternalLinks(toLex(body), SITE_HOST)).toEqual(['https://a.dev/one', 'https://b.dev/two'])
  })

  it('excludes links back to the site itself', () => {
    const body: PortableTextBody = [
      textBlock('b1', [
        { key: 'l1', href: 'https://example.com/posts/hello' },
        { key: 'l2', href: 'https://a.dev/one' },
      ]),
    ]
    expect(extractExternalLinks(toLex(body), SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('drops non-http(s) hrefs (mailto, anchors, relative)', () => {
    const body: PortableTextBody = [
      textBlock('b1', [
        { key: 'l1', href: 'mailto:a@b.c' },
        { key: 'l2', href: '#frag' },
        { key: 'l3', href: '/local/path' },
        { key: 'l4', href: 'https://a.dev/one' },
      ]),
    ]
    expect(extractExternalLinks(toLex(body), SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('normalizes and dedupes (fragment, default port, trailing slash)', () => {
    const body: PortableTextBody = [
      textBlock('b1', [{ key: 'l1', href: 'https://a.dev/one/#section' }]),
      textBlock('b2', [
        { key: 'l2', href: 'https://a.dev:443/one' },
        { key: 'l3', href: 'https://a.dev/one/' },
      ]),
    ]
    expect(extractExternalLinks(toLex(body), SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('ignores non-link markDefs and blocks without markDefs', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [{ _type: 'footnoteRef', _key: 'f1', targetKey: 'fn1', index: 1 }],
        children: [{ _type: 'span', _key: 's1', text: 'note', marks: ['f1'] }],
      },
      textBlock('b2', [{ key: 'l1', href: 'https://a.dev/one' }]),
    ]
    expect(extractExternalLinks(toLex(body), SITE_HOST)).toEqual(['https://a.dev/one'])
  })

  it('caps the extraction at the per-post maximum', () => {
    const links = Array.from({ length: MAX_OUTBOUND_LINKS_PER_POST + 10 }, (_, i) => ({
      key: `l${i}`,
      href: `https://a.dev/${i}`,
    }))
    expect(extractExternalLinks(toLex([textBlock('b1', links)]), SITE_HOST)).toHaveLength(MAX_OUTBOUND_LINKS_PER_POST)
  })
})
