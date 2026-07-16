import { describe, expect, it } from 'vitest'

import {
  extractLinks,
  extractSourceMetadata,
  normalizeForMatch,
  sourceLinksToTarget,
} from '@/server/domains/webmentions/verify'

describe('webmentions/verify normalizeForMatch', () => {
  it('strips the fragment and trailing slashes', () => {
    expect(normalizeForMatch('https://example.com/posts/foo/#comments')).toBe('https://example.com/posts/foo')
    expect(normalizeForMatch('https://example.com/posts/foo')).toBe('https://example.com/posts/foo')
  })

  it('drops default ports but keeps explicit ones', () => {
    expect(normalizeForMatch('https://example.com:443/posts/foo')).toBe('https://example.com/posts/foo')
    expect(normalizeForMatch('http://example.com:80/posts/foo')).toBe('http://example.com/posts/foo')
    expect(normalizeForMatch('https://example.com:8443/posts/foo')).toBe('https://example.com:8443/posts/foo')
  })

  it('keeps the query string and the scheme (strict rule)', () => {
    expect(normalizeForMatch('https://example.com/posts/foo?utm_source=x')).toBe(
      'https://example.com/posts/foo?utm_source=x',
    )
    expect(normalizeForMatch('http://example.com/posts/foo')).toBe('http://example.com/posts/foo')
  })

  it('rejects non-http(s) and unparseable URLs', () => {
    expect(normalizeForMatch('ftp://example.com/foo')).toBeNull()
    expect(normalizeForMatch('not a url')).toBeNull()
  })
})

describe('webmentions/verify extractLinks', () => {
  it('extracts double-, single-quoted and unquoted hrefs', () => {
    const html = `
      <a href="https://a.example/1">one</a>
      <a class='x' href='https://a.example/2'>two</a>
      <a href=https://a.example/3>three</a>
      <a id="no-href">four</a>
    `
    expect(extractLinks(html)).toEqual(['https://a.example/1', 'https://a.example/2', 'https://a.example/3'])
  })

  it('decodes HTML entities inside hrefs', () => {
    expect(extractLinks('<a href="https://a.example/?a=1&amp;b=2">x</a>')).toEqual(['https://a.example/?a=1&b=2'])
  })
})

describe('webmentions/verify sourceLinksToTarget', () => {
  const source = 'https://sender.example/blog/post'
  const target = 'https://example.com/posts/hello/'

  it('accepts an exact link and one with fragment / trailing-slash variance', () => {
    expect(sourceLinksToTarget(`<a href="https://example.com/posts/hello">x</a>`, source, target)).toBe(true)
    expect(sourceLinksToTarget(`<a href="https://example.com/posts/hello/#replies">x</a>`, source, target)).toBe(true)
  })

  it('resolves relative links against the source URL', () => {
    const html = '<a href="/posts/hello">x</a>'
    expect(sourceLinksToTarget(html, 'https://example.com/blog/post', target)).toBe(true)
    expect(sourceLinksToTarget(html, source, target)).toBe(false)
  })

  it('rejects a document that never links to the target', () => {
    expect(sourceLinksToTarget('<p>no links here</p>', source, target)).toBe(false)
    expect(sourceLinksToTarget('<a href="https://example.com/posts/other">x</a>', source, target)).toBe(false)
    // Tracking params are NOT the canonical target (strict rule).
    expect(sourceLinksToTarget('<a href="https://example.com/posts/hello?utm_source=x">x</a>', source, target)).toBe(
      false,
    )
    // Scheme downgrade is not a match.
    expect(sourceLinksToTarget('<a href="http://example.com/posts/hello">x</a>', source, target)).toBe(false)
  })
})

describe('webmentions/verify extractSourceMetadata', () => {
  it('reads the title tag, meta author and meta description', () => {
    const html = `
      <html><head>
        <title> A nice &amp; thoughtful post </title>
        <meta name="author" content="Jane Doe">
        <meta content="A short summary." name="description">
      </head><body></body></html>
    `
    expect(extractSourceMetadata(html)).toEqual({
      authorName: 'Jane Doe',
      title: 'A nice & thoughtful post',
      summary: 'A short summary.',
    })
  })

  it('falls back to og:title / og:description and returns nulls when absent', () => {
    const ogOnly = '<meta property="og:title" content="OG Title"><meta property="og:description" content="OG desc">'
    expect(extractSourceMetadata(ogOnly)).toEqual({ authorName: null, title: 'OG Title', summary: 'OG desc' })
    expect(extractSourceMetadata('<p>nothing</p>')).toEqual({ authorName: null, title: null, summary: null })
  })

  it('strips markup from extracted values', () => {
    const html = '<title><b>Bold</b> title</title>'
    expect(extractSourceMetadata(html).title).toBe('Bold title')
  })
})
