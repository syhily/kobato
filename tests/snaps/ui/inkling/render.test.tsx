import { describe, expect, it } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { InklingBody } from '@/ui/inkling/render/InklingBody'

const key = (n: number) => `k${n.toString().padStart(6, '0')}`

function makeDocument(children: InklingDocument['root']['children']): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children,
    },
  }
}

function text(value: string, n: number, format = 0) {
  return { type: 'text' as const, version: 1, key: key(n), text: value, format }
}

describe('InklingBody SSR renderer', () => {
  it('renders standard text blocks with anchor ids on headings', () => {
    const doc = makeDocument([
      { type: 'heading', version: 1, key: key(1), tag: 'h2', children: [text('我的标题', 2)] },
      {
        type: 'paragraph',
        version: 1,
        key: key(3),
        children: [text('Hello ', 4), text('world', 5, 1)],
      },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toContain('<h2 id="')
    expect(html).toContain('我的标题</h2>')
    expect(html).toMatch(/<strong[^>]*>world<\/strong>/)
  })

  it('renders custom blocks with the right wrappers', () => {
    const doc = makeDocument([
      {
        type: 'image-card',
        version: 1,
        key: key(1),
        src: 'https://example.com/x.jpg',
        alt: 'demo',
        caption: 'caption text',
      },
      {
        type: 'code-block',
        version: 1,
        key: key(2),
        code: 'console.log(1)',
        language: 'js',
      },
      {
        type: 'math-block',
        version: 1,
        key: key(3),
        tex: 'a^2 + b^2 = c^2',
      },
      { type: 'horizontal-rule', version: 1, key: key(4) },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toMatch(/<figure[^>]*>/)
    expect(html).toContain('<figcaption>caption text</figcaption>')
    expect(html).toMatch(/class="[^"]*math-display[^"]*"/)
    expect(html).toContain('<hr/>')
  })

  it('renders a table block with header row + inline link in cell', () => {
    const doc = makeDocument([
      {
        type: 'table',
        version: 1,
        key: key(1),
        rows: [
          {
            type: 'tablerow',
            version: 1,
            key: key(2),
            cells: [
              {
                type: 'tablecell',
                version: 1,
                key: key(3),
                isHeader: true,
                children: [text('名称', 4)],
              },
              {
                type: 'tablecell',
                version: 1,
                key: key(5),
                isHeader: true,
                children: [text('链接', 6)],
              },
            ],
          },
          {
            type: 'tablerow',
            version: 1,
            key: key(7),
            cells: [
              {
                type: 'tablecell',
                version: 1,
                key: key(8),
                children: [text('示例', 9)],
              },
              {
                type: 'tablecell',
                version: 1,
                key: key(10),
                children: [
                  {
                    type: 'link',
                    version: 1,
                    key: key(11),
                    url: 'https://example.com',
                    children: [text('site', 12)],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toContain('<table class="pt-table">')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toMatch(/<a href="https:\/\/example\.com"[^>]*>site<\/a>/)
  })

  it('renders nested bullet lists with a 2-level hierarchy', () => {
    const doc = makeDocument([
      {
        type: 'list',
        version: 1,
        key: key(1),
        listType: 'bullet',
        children: [
          {
            type: 'listitem',
            version: 1,
            key: key(2),
            value: 1,
            children: [
              text('parent', 3),
              {
                type: 'list',
                version: 1,
                key: key(4),
                listType: 'bullet',
                children: [
                  {
                    type: 'listitem',
                    version: 1,
                    key: key(5),
                    value: 1,
                    children: [text('child', 6)],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toContain('parent')
    expect(html).toContain('child')
    expect(html.indexOf('<ul>')).toBeGreaterThanOrEqual(0)
  })

  it('renders footnote definitions in a single trailing section', () => {
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [
          text('See note', 2),
          { type: 'footnote-ref', version: 1, key: key(3), targetKey: key(10), refKey: key(3), index: 1 },
        ],
      },
      {
        type: 'footnote-definition',
        version: 1,
        key: key(10),
        targetKey: key(10),
        index: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            key: key(11),
            children: [text('脚注内容', 12)],
          },
        ],
      },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toContain('id="user-content-fnref-1"')
    expect(html).toContain('href="#user-content-fn-1"')
    expect(html).toContain('class="footnotes"')
    expect(html).toContain('id="footnotes-section-heading"')
    expect(html).toContain('尾声礼记')
    expect(html).toContain('id="user-content-fn-1"')
    expect(html).toContain('脚注内容')
    // Backref lives in a standalone trailing <p> (mirrors the SSR string
    // renderer in server/render/inkling/html.ts so RSS / plaintext
    // extraction agrees with the React render). The previous assertion
    // required the backref to be inlined into the footnote's last
    // paragraph; both renderers now emit a separate <p> for consistency.
    expect(html).toMatch(/脚注内容[^]*<p>[^]*href="#user-content-fnref-1"/)
  })

  it('renders twoColumn as a responsive grid with both panes', () => {
    const doc = makeDocument([
      {
        type: 'two-column',
        version: 1,
        key: key(1),
        left: [
          {
            type: 'paragraph',
            version: 1,
            key: key(2),
            children: [text('Alpha', 3)],
          },
        ],
        right: [
          {
            type: 'paragraph',
            version: 1,
            key: key(4),
            children: [text('Beta', 5)],
          },
        ],
      },
    ])
    const html = stableHtml(renderInRouter(<InklingBody document={doc} />))
    expect(html).toContain('data-pt-two-column')
    expect(html).toContain('Alpha')
    expect(html).toContain('Beta')
    expect(html).toMatch(/grid-cols-1/)
    expect(html).toMatch(/md:grid-cols-2/)
  })
})
