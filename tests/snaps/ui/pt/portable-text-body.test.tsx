import { describe, expect, it } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { PortableTextBody as PortableTextBodyComponent } from '@/ui/pt/render'

// Snapshot-style assertions for the SSR PortableText renderer. The
// renderer is exercised top-to-bottom for each block type so a future
// change that quietly drops a node — e.g. removing the `<figure>`
// wrapper around image blocks, breaking the math `{__html}` payload,
// or losing the footnote section — fails this contract instead of
// silently shipping degraded markup.

describe('PortableTextBody SSR renderer', () => {
  it('renders standard text blocks with anchor ids on headings', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'h1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: '我的标题' }],
      },
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's2', text: 'Hello ', marks: undefined },
          { _type: 'span', _key: 's3', text: 'world', marks: ['strong'] },
        ],
      },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    expect(html).toContain('<h2 id="')
    expect(html).toContain('我的标题</h2>')
    expect(html).toMatch(/<strong[^>]*>world<\/strong>/)
  })

  it('renders custom blocks with the right wrappers', () => {
    const body: PortableTextBody = [
      {
        _type: 'image',
        _key: 'img1',
        src: 'https://example.com/x.jpg',
        alt: 'demo',
        caption: 'caption text',
      },
      {
        _type: 'code',
        _key: 'code1',
        code: 'console.log(1)',
        language: 'js',
      },
      {
        _type: 'mathBlock',
        _key: 'math1',
        tex: 'a^2 + b^2 = c^2',
      },
      { _type: 'horizontalRule', _key: 'hr1' },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    expect(html).toMatch(/<figure[^>]*>/)
    expect(html).toContain('<figcaption>caption text</figcaption>')
    expect(html).toMatch(/class="[^"]*math-display[^"]*"/)
    expect(html).toContain('<hr/>')
  })

  it('renders a table block with header row + inline link in cell', () => {
    const body: PortableTextBody = [
      {
        _type: 'table',
        _key: 'tbl1',
        hasHeaderRow: true,
        rows: [
          {
            _type: 'tableRow',
            _key: 'r0',
            cells: [
              {
                _type: 'tableCell',
                _key: 'r0c0',
                isHeader: true,
                content: [{ _type: 'span', _key: 's', text: '名称' }],
              },
              {
                _type: 'tableCell',
                _key: 'r0c1',
                isHeader: true,
                content: [{ _type: 'span', _key: 's', text: '链接' }],
              },
            ],
          },
          {
            _type: 'tableRow',
            _key: 'r1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'r1c0',
                content: [{ _type: 'span', _key: 's', text: '示例' }],
              },
              {
                _type: 'tableCell',
                _key: 'r1c1',
                content: [{ _type: 'span', _key: 's', text: 'site', marks: ['lk'] }],
                markDefs: [{ _type: 'link', _key: 'lk', href: 'https://example.com' }],
              },
            ],
          },
        ],
      },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    expect(html).toContain('<table class="pt-table">')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toMatch(/<a href="https:\/\/example\.com"[^>]*>site<\/a>/)
  })

  it('renders nested bullet lists with a 2-level hierarchy', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'l1',
        listItem: 'bullet',
        level: 1,
        style: 'normal',
        children: [{ _type: 'span', _key: 's', text: 'parent' }],
      },
      {
        _type: 'block',
        _key: 'l2',
        listItem: 'bullet',
        level: 2,
        style: 'normal',
        children: [{ _type: 'span', _key: 's', text: 'child' }],
      },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    expect(html).toContain('parent')
    expect(html).toContain('child')
    expect(html.indexOf('<ul>')).toBeGreaterThanOrEqual(0)
  })

  it('renders footnote definitions in a single trailing section', () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'See note',
            marks: ['fnref'],
          },
        ],
        markDefs: [
          {
            _type: 'footnoteRef',
            _key: 'fnref',
            targetKey: 'fn1',
            index: 1,
          },
        ],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [
          {
            _type: 'block',
            _key: 'fn1p',
            style: 'normal',
            children: [{ _type: 'span', _key: 'fns', text: '脚注内容' }],
          },
        ],
      },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    // Reference inline.
    expect(html).toContain('id="user-content-fnref-1"')
    expect(html).toContain('href="#user-content-fn-1"')
    // Definition section appended at the end.
    expect(html).toContain('class="footnotes"')
    expect(html).toContain('id="footnotes-section-heading"')
    expect(html).toContain('尾声礼记')
    expect(html).toContain('id="user-content-fn-1"')
    expect(html).toContain('脚注内容')
    expect(html).toMatch(/<p>[^]*脚注内容[^]*href="#user-content-fnref-1"/)
  })

  it('renders twoColumn as a responsive grid with both panes', () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [
          {
            _type: 'block',
            _key: 'l',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'Alpha' }],
          },
        ],
        right: [
          {
            _type: 'block',
            _key: 'r',
            style: 'normal',
            children: [{ _type: 'span', _key: 's2', text: 'Beta' }],
          },
        ],
      },
    ]
    const html = stableHtml(renderInRouter(<PortableTextBodyComponent body={body} />))
    expect(html).toContain('data-pt-two-column')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
    expect(html).toMatch(/grid-cols-1/)
    expect(html).toMatch(/md:grid-cols-2/)
  })
})
