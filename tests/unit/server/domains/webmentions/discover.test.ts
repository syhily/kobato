import { describe, expect, it } from 'vitest'

import { parseWebmentionEndpoint } from '@/server/domains/webmentions/discover'

// Pure parser tests — the network shell is a thin safeFetch wrapper whose
// parameters mirror the receiver's fetchSourceHtml (covered there).

const FINAL = 'https://example.com/blog/post'

describe('webmentions/discover.parseWebmentionEndpoint', () => {
  it('reads a single-value Link header', () => {
    expect(parseWebmentionEndpoint('<https://example.com/wm>; rel="webmention"', '', FINAL)).toBe(
      'https://example.com/wm',
    )
  })

  it('matches webmention among several rel tokens', () => {
    expect(parseWebmentionEndpoint('<https://example.com/wm>; rel="webmention pingback"', '', FINAL)).toBe(
      'https://example.com/wm',
    )
  })

  it('is case-insensitive on the rel tokens', () => {
    expect(parseWebmentionEndpoint('<https://example.com/wm>; rel="WebMention"', '', FINAL)).toBe(
      'https://example.com/wm',
    )
  })

  it('reads several Link values merged into one header line', () => {
    const header = '<https://example.com/next>; rel="next", <https://example.com/wm>; rel="webmention"'
    expect(parseWebmentionEndpoint(header, '', FINAL)).toBe('https://example.com/wm')
  })

  it('prefers the Link header over the HTML declaration', () => {
    const html = '<html><head><link rel="webmention" href="https://example.com/html-wm"></head></html>'
    expect(parseWebmentionEndpoint('<https://example.com/header-wm>; rel="webmention"', html, FINAL)).toBe(
      'https://example.com/header-wm',
    )
  })

  it('reads an HTML <link> declaration', () => {
    const html = '<html><head><link href="https://example.com/wm" rel="webmention"></head></html>'
    expect(parseWebmentionEndpoint(null, html, FINAL)).toBe('https://example.com/wm')
  })

  it('reads an HTML <a rel="webmention"> declaration', () => {
    const html = '<body><a rel="webmention" href="/wm">webmention</a></body>'
    expect(parseWebmentionEndpoint(null, html, FINAL)).toBe('https://example.com/wm')
  })

  it('resolves a relative endpoint against the final (post-redirect) URL', () => {
    const html = '<link rel="webmention" href="../wm">'
    // Base ends in `/post/` (a directory), so `../wm` lands under /blog/.
    expect(parseWebmentionEndpoint(null, html, 'https://example.com/blog/post/')).toBe('https://example.com/blog/wm')
    expect(parseWebmentionEndpoint(null, html, 'https://example.com/blog/post')).toBe('https://example.com/wm')
  })

  it('accepts single-quoted and unquoted attributes', () => {
    expect(parseWebmentionEndpoint(null, "<link rel='webmention' href='/wm'>", FINAL)).toBe('https://example.com/wm')
    expect(parseWebmentionEndpoint(null, '<link rel=webmention href=/wm>', FINAL)).toBe('https://example.com/wm')
  })

  it('returns null when nothing declares an endpoint', () => {
    expect(parseWebmentionEndpoint(null, '<html><head><link rel="icon" href="/i.png"></head></html>', FINAL)).toBeNull()
    expect(parseWebmentionEndpoint('<https://example.com/next>; rel="next"', '', FINAL)).toBeNull()
    expect(parseWebmentionEndpoint(null, '', FINAL)).toBeNull()
  })

  it('rejects a non-http(s) endpoint and keeps looking', () => {
    const html = '<link rel="webmention" href="mailto:a@b.c"><a rel="webmention" href="/wm">x</a>'
    expect(parseWebmentionEndpoint(null, html, FINAL)).toBe('https://example.com/wm')
  })

  it('ignores a rel token that merely contains the word', () => {
    expect(parseWebmentionEndpoint('<https://example.com/x>; rel="webmentions"', '', FINAL)).toBeNull()
  })
})
