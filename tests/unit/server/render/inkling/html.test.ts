import { describe, expect, it, vi } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { renderInklingToHtml } from '@/server/render/inkling/html'

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

function mockDb(): Parameters<typeof renderInklingToHtml>[0] {
  return {
    query: {
      users: { findMany: vi.fn() },
    },
  } as unknown as Parameters<typeof renderInklingToHtml>[0]
}

describe('server/render/inkling/html', () => {
  it('renders empty document', async () => {
    const db = mockDb()
    const html = await renderInklingToHtml(db, makeDocument([]), [])
    expect(html).toBe('')
  })

  it('renders headings with ids from slugs', async () => {
    const db = mockDb()
    const doc = makeDocument([{ type: 'heading', version: 1, key: key(1), tag: 'h2', children: [text('My Title', 2)] }])
    const html = await renderInklingToHtml(db, doc, ['custom-slug'])
    expect(html).toContain('<h2 id="custom-slug">My Title</h2>')
  })

  it('renders paragraph with decorated text', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [
          text('Hello ', 2),
          text('world', 3, 1), // strong
        ],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('renders a link with rel and target', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [
          {
            type: 'link',
            version: 1,
            key: key(2),
            url: 'https://example.com',
            target: '_blank',
            rel: 'noopener',
            children: [text('link text', 3)],
          },
        ],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('<a href="https://example.com" rel="noopener" target="_blank">link text</a>')
  })

  it('falls back to plain tex for inline math in rss mode', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [{ type: 'inline-math', version: 1, key: key(2), tex: 'E=mc^2', mathml: '<math>E=mc^2</math>' }],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [], { rssMode: true })
    expect(html).toContain('<code>E=mc^2</code>')
    expect(html).not.toContain('<math>')
  })

  it('renders mathml inline math in web mode', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [{ type: 'inline-math', version: 1, key: key(2), tex: 'E=mc^2', mathml: '<math>E=mc^2</math>' }],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [], { rssMode: false })
    expect(html).toContain('<math>E=mc^2</math>')
  })

  it('renders image block with dimensions and caption', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'image-card',
        version: 1,
        key: key(1),
        src: 'https://example.com/x.jpg',
        alt: 'demo',
        caption: 'caption text',
        width: 1280,
        height: 720,
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('<figure>')
    expect(html).toContain('src="https://example.com/x.jpg"')
    expect(html).toContain('alt="demo"')
    expect(html).toContain('width="1280"')
    expect(html).toContain('height="720"')
    expect(html).toContain('<figcaption>caption text</figcaption>')
  })

  it('renders code block with highlighted html', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'code-block',
        version: 1,
        key: key(1),
        code: 'console.log(1)',
        language: 'js',
        highlightedHtml: '<span class="token">console</span>',
      },
    ])
    const html = await renderInklingToHtml(db, doc, [], { rssMode: false })
    expect(html).toContain('<pre><code class="language-js" data-language="js">')
    expect(html).toContain('<span class="token">console</span>')
  })

  it('renders code block with escaped source when no highlight', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'code-block',
        version: 1,
        key: key(1),
        code: '<script>alert(1)</script>',
        language: 'js',
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('renders math block fallback in rss mode', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'math-block',
        version: 1,
        key: key(1),
        tex: 'a^2 + b^2 = c^2',
        mathml: '<math/>',
      },
    ])
    const html = await renderInklingToHtml(db, doc, [], { rssMode: true })
    expect(html).toContain('<pre><code>a^2 + b^2 = c^2</code></pre>')
  })

  it('renders mathml in web mode', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'math-block',
        version: 1,
        key: key(1),
        tex: 'a^2 + b^2 = c^2',
        mathml: '<math><mrow/></math>',
      },
    ])
    const html = await renderInklingToHtml(db, doc, [], { rssMode: false })
    // sanitize-html normalizes self-closing tags: <mrow/> → <mrow></mrow>
    expect(html).toContain('<math><mrow></mrow></math>')
  })

  it('renders horizontal rule', async () => {
    const db = mockDb()
    const doc = makeDocument([{ type: 'horizontal-rule', version: 1, key: key(1) }])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toBe('<hr />')
  })

  it('renders nested bullet list', async () => {
    const db = mockDb()
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
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>parent')
    expect(html).toContain('<ul><li>child</li></ul>')
    expect(html).toContain('</li></ul>')
  })

  it('renders table with header row', async () => {
    const db = mockDb()
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
                children: [text('Name', 4)],
              },
              {
                type: 'tablecell',
                version: 1,
                key: key(5),
                isHeader: true,
                children: [text('Value', 6)],
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
                children: [text('x', 9)],
              },
              {
                type: 'tablecell',
                version: 1,
                key: key(10),
                children: [text('1', 11)],
              },
            ],
          },
        ],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('<table>')
    expect(html).toContain('<thead>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<td>x</td>')
  })

  it('renders footnote reference and definition section', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        key: key(1),
        children: [
          text('See note ', 2),
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
            children: [text('Footnote content', 12)],
          },
        ],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    // The reference `<sup>` carries `id="user-content-fnref-N"` so the
    // backref `↩` anchor (which targets `#user-content-fnref-N`) resolves.
    // Without this id the backref is a dead link. Mirrors the React renderer
    // in marks/FootnoteRefMark.tsx.
    expect(html).toContain('<sup id="user-content-fnref-1"><a href="#user-content-fn-1">1</a></sup>')
    expect(html).toContain('<section class="footnotes"')
    expect(html).toContain('id="user-content-fn-1"')
    expect(html).toContain('Footnote content')
    expect(html).toContain('<a href="#user-content-fnref-1" data-footnote-backref=')
  })

  it('renders two-column as div in web mode and concatenated in rss mode', async () => {
    const db = mockDb()
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
    const webHtml = await renderInklingToHtml(db, doc, [], { rssMode: false })
    expect(webHtml).toContain('<div>')
    expect(webHtml).toContain('<p>Alpha</p>')
    expect(webHtml).toContain('<p>Beta</p>')

    const rssHtml = await renderInklingToHtml(db, doc, [], { rssMode: true })
    expect(rssHtml).toBe('<p>Alpha</p><p>Beta</p>')
  })

  it('renders solution container', async () => {
    const db = mockDb()
    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        key: key(1),
        children: [
          {
            type: 'paragraph',
            version: 1,
            key: key(2),
            children: [text('Therefore x = 1', 3)],
          },
        ],
      },
    ])
    const html = await renderInklingToHtml(db, doc, [])
    expect(html).toContain('<p>Therefore x = 1</p>')
  })
})
