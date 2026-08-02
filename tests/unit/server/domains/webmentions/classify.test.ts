import { describe, expect, it } from 'vitest'

import { classifyWebmentionType } from '@/server/domains/webmentions/classify'

const SOURCE = 'https://sender.example/blog/mentioning-post'
const TARGET = 'https://example.com/posts/wm-target/'

describe('unit / classifyWebmentionType', () => {
  it('classifies a u-in-reply-to anchor as a reply', () => {
    const html = `<article class="h-entry">
      <p><a class="u-in-reply-to" href="https://example.com/posts/wm-target/">the post I reply to</a></p>
    </article>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('reply')
  })

  it('classifies a u-like-of anchor as a like', () => {
    const html = `<a class="u-like-of" href="https://example.com/posts/wm-target/">liked this</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('like')
  })

  it('classifies a u-repost-of anchor as a repost', () => {
    const html = `<a class="u-repost-of h-cite" href="https://example.com/posts/wm-target/">reposted</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('repost')
  })

  it('resolves relative marker hrefs against the source URL', () => {
    const html = `<a class="u-like-of" href="/posts/wm-target/">liked</a>`
    expect(classifyWebmentionType(html, 'https://example.com/blog/other', TARGET)).toBe('like')
  })

  it('matches markers whose href converges under normalizeForMatch (fragment / trailing slash)', () => {
    const html = `<a class="u-in-reply-to" href="https://example.com/posts/wm-target#comments">reply</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('reply')
  })

  it('ignores markers pointing at a different URL', () => {
    const html =
      `<a class="u-like-of" href="https://example.com/posts/someone-else/">liked that</a>` +
      `<a href="https://example.com/posts/wm-target/">and mentioned this</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('mention')
  })

  it('prefers the strongest marker when several point at the target (reply > repost > like)', () => {
    const html =
      `<a class="u-like-of" href="https://example.com/posts/wm-target/">liked</a>` +
      `<a class="u-repost-of" href="https://example.com/posts/wm-target/">reposted</a>` +
      `<a class="u-in-reply-to" href="https://example.com/posts/wm-target/">replied</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('reply')
  })

  it('falls back to mention for a plain link without markers', () => {
    const html = `<p>I wrote about <a href="https://example.com/posts/wm-target/">this post</a>.</p>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('mention')
  })

  it('falls back to mention when the marker lives on a wrapper element, not the anchor', () => {
    // Documented limitation: without a DOM parser, nesting cannot be
    // tracked — the mention still verifies through the plain link rule.
    const html = `<div class="u-like-of"><a href="https://example.com/posts/wm-target/">liked</a></div>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('mention')
  })

  it('falls back to mention for a marker anchor without an href', () => {
    const html = `<a class="u-like-of">no href</a><a href="https://example.com/posts/wm-target/">link</a>`
    expect(classifyWebmentionType(html, SOURCE, TARGET)).toBe('mention')
  })
})
