import { describe, expect, it } from 'vitest'

import { markdownToSanitizedHtml } from '@/plugins/behaviour/markdownPaste'

// The headless leg of the paste markdown dialect: markdown text in, sanitized
// HTML out — no composer, no DataTransfer. The Lexical HTML import that
// consumes this output is pinned in test/unit/plugins/MarkdownPastePlugin.test.tsx.
describe('markdownToSanitizedHtml', () => {
  it('renders markdown through the shared markdown-it engine', () => {
    expect(markdownToSanitizedHtml('# Title', { allowBr: false })).toBe('<h1>Title</h1>\n')
  })

  it('renders ==mark==, ~sub~, and ^sup^ inline dialect syntax', () => {
    const html = markdownToSanitizedHtml('==marked== ~sub~ ^sup^', { allowBr: false })
    expect(html).toContain('<mark>marked</mark>')
    expect(html).toContain('<sub>sub</sub>')
    expect(html).toContain('<sup>sup</sup>')
  })

  it('renders footnotes', () => {
    const html = markdownToSanitizedHtml('note.[^1]\n\n[^1]: The text.', { allowBr: false })
    expect(html).toContain('footnote-ref')
  })

  it('strips <br> tags when allowBr is false', () => {
    // two trailing spaces are a markdown hard break, rendered as <br>
    expect(markdownToSanitizedHtml('a  \nb', { allowBr: false })).not.toContain('<br')
  })

  it('keeps <br> tags when allowBr is true', () => {
    expect(markdownToSanitizedHtml('a  \nb', { allowBr: true })).toContain('<br')
  })

  it('removes script embeds and replaces iframe embeds with placeholders', () => {
    expect(markdownToSanitizedHtml('<script>alert(1)</script>', { allowBr: false })).not.toContain('<script>')
    expect(markdownToSanitizedHtml('<iframe src="https://example.com"></iframe>', { allowBr: false })).toContain(
      'iframe-embed-placeholder',
    )
  })

  it('strips javascript: hrefs', () => {
    expect(markdownToSanitizedHtml('<a href="javascript:alert(1)">x</a>', { allowBr: false })).not.toContain(
      'javascript:',
    )
  })
})
