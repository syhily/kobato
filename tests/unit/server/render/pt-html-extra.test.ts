import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
// Extends pt-html-branches.test.ts — fills in the remaining
// uncovered branches: image alt/width/height/caption, code-block CDATA
// in RSS mode, math svg/mathml web paths, twoColumn RSS concat, the
// footnote section emit, heading-id map fallback, list/li marks, the
// `solution`/`footnoteDefinition` music collectors, and inline marks
// (strong/em/code/footnoteRef) including the undefined-value short-circuits.

import { renderPortableTextToHtml } from '@/server/render/pt-html'

// The music meta lookup arrives through the injected PT embed seam, so the
// suite stubs the resolver directly — no module mock of the music domain.
const resolveMusicEmbeds = vi.fn<MusicEmbedResolver>()

beforeEach(() => {
  resolveMusicEmbeds.mockReset()
  resolveMusicEmbeds.mockResolvedValue(new Map())
})

describe('render/pt-html — image block attribute branches', () => {
  it('emits alt/width/height/caption when all are provided', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'image',
          _key: 'i1',
          src: 'https://cdn/x.png',
          alt: 'desc',
          width: 200,
          height: 100,
          caption: 'cap',
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('alt="desc"')
    expect(html).toContain('width="200"')
    expect(html).toContain('height="100"')
    expect(html).toContain('<figcaption>cap</figcaption>')
  })

  it('omits alt/width/height/caption when they are empty / undefined', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'image',
          _key: 'i2',
          src: 'https://cdn/y.png',
          alt: '',
          width: undefined,
          height: undefined,
          caption: '',
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).not.toContain('alt=')
    expect(html).not.toContain('width=')
    expect(html).not.toContain('height=')
    expect(html).not.toContain('<figcaption>')
    // src is always present.
    expect(html).toContain('src="https://cdn/y.png"')
  })

  it('escapes special characters in src/alt/caption', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'image', _key: 'i3', src: 'https://cdn/x?a=1&b=2', alt: 'a"b', caption: '<x>' }],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('src="https://cdn/x?a=1&amp;b=2"')
    expect(html).toContain('alt="a&quot;b"')
    expect(html).toContain('&lt;x&gt;')
  })
})

describe('render/pt-html — code block RSS CDATA wrapping', () => {
  it('wraps highlighted HTML in CDATA when in RSS mode', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'code', _key: 'c1', code: 'x', language: 'ts', highlightedHtml: '<span>hl</span>' }],
      [],
      resolveMusicEmbeds,
      { rssMode: true },
    )
    expect(html).toContain('<![CDATA[<span>hl</span>]]>')
    expect(html).toContain('class="language-ts"')
    expect(html).toContain('data-language="ts"')
  })

  it('escapes plain code in RSS mode when no highlighted HTML is provided', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'code', _key: 'c2', code: '<b>', language: '' }],
      [],
      resolveMusicEmbeds,
      { rssMode: true },
    )
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<![CDATA[')
  })
})

describe('render/pt-html — math block web paths', () => {
  it('emits raw svg on the web path when svg is present', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'mathBlock', _key: 'm1', tex: 'x', svg: '<svg>svg</svg>' }],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toBe('<svg>svg</svg>')
  })

  it('emits raw mathml on the web path when svg is empty but mathml is present', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'mathBlock', _key: 'm2', tex: 'x', svg: '', mathml: '<math>ml</math>' }],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toBe('<math>ml</math>')
  })
})

describe('render/pt-html — inline math marks (web path)', () => {
  it('emits svg for an inline math mark on the web path', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'plain', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'x', svg: '<svg>i</svg>' }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<svg>i</svg>')
  })

  it('emits mathml for an inline math mark when svg is empty', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'plain', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'x', svg: '', mathml: '<math>i</math>' }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<math>i</math>')
  })
})

describe('render/pt-html — twoColumn RSS concat', () => {
  it('concatenates left+right without a wrapper div in RSS mode', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'twoColumn',
          _key: 'tc1',
          left: [{ _type: 'block', _key: 'l1', style: 'normal', children: [{ _type: 'span', _key: 'ls', text: 'L' }] }],
          right: [
            { _type: 'block', _key: 'r1', style: 'normal', children: [{ _type: 'span', _key: 'rs', text: 'R' }] },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
      { rssMode: true },
    )
    expect(html).toContain('<p>L</p>')
    expect(html).toContain('<p>R</p>')
    expect(html).not.toContain('<div>')
  })
})

describe('render/pt-html — footnotes section', () => {
  it('appends a footnotes section when footnoteDefinition blocks are present', async () => {
    const html = await renderPortableTextToHtml(
      [
        { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'body' }] },
        {
          _type: 'footnoteDefinition',
          _key: 'fn1',
          index: 1,
          children: [
            {
              _type: 'block',
              _key: 'fnb1',
              style: 'normal',
              children: [{ _type: 'span', _key: 'fns', text: 'note text' }],
            },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<section class="footnotes"')
    expect(html).toContain('id="user-content-fn-1"')
    expect(html).toContain('href="#user-content-fnref-1"')
    expect(html).toContain('data-footnote-backref')
    // body still rendered inline.
    expect(html).toContain('<p>body</p>')
  })
})

describe('render/pt-html — heading id map fallback', () => {
  it('uses the provided heading slug when present', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'block', _key: 'h1', style: 'h2', children: [{ _type: 'span', _key: 's1', text: 'Hello World' }] }],
      ['hello-world'],
      resolveMusicEmbeds,
    )
    expect(html).toContain('id="hello-world"')
  })

  it('derives a slug when the provided slot is empty', async () => {
    const html = await renderPortableTextToHtml(
      [{ _type: 'block', _key: 'h2', style: 'h2', children: [{ _type: 'span', _key: 's1', text: 'Hello World' }] }],
      [''], // empty → deriveSlug path
      resolveMusicEmbeds,
    )
    // deriveSlug('Hello World') should produce a slug.
    expect(html).toMatch(/id="hello-world"/)
  })
})

describe('render/pt-html — lists and inline marks', () => {
  it('wraps bullet and number list items with <ul>/<ol>', async () => {
    // The PortableText list shape: top-level block carries `listItem`,
    // and consecutive items with the same `level` form a list group.
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'li1',
          style: 'normal',
          level: 1,
          listItem: 'bullet',
          children: [{ _type: 'span', _key: 's1', text: 'one' }],
        },
        {
          _type: 'block',
          _key: 'li2',
          style: 'normal',
          level: 1,
          listItem: 'number',
          children: [{ _type: 'span', _key: 's2', text: 'two' }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    // bullet + number list components each render their <li> children.
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('applies strong/em/underline/strike-through/code marks to spans', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [
            { _type: 'span', _key: 's1', text: 'x', marks: ['strong', 'em', 'underline', 'strike-through', 'code'] },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<strong>')
    expect(html).toContain('<em>')
    expect(html).toContain('<u>')
    expect(html).toContain('<s>')
    expect(html).toContain('<code>')
  })

  it('renders a footnoteRef mark as a superscript anchor', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'note', marks: ['fr1'] }],
          markDefs: [{ _type: 'footnoteRef', _key: 'fr1', targetKey: 'fn1', index: 7 }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<sup>')
    expect(html).toContain('href="#user-content-fn-7"')
    expect(html).toContain('>7<')
  })
})

describe('render/pt-html — music player happy path', () => {
  it('renders an <audio> figure with the resolved cover when the music meta resolves', async () => {
    resolveMusicEmbeds.mockResolvedValue(
      new Map([
        [
          'p-1',
          {
            id: 'p-1',
            name: 'Song',
            artist: 'Artist',
            album: 'Album',
            url: 'https://cdn/to.mp3',
            pic: 'https://cdn/to.jpg',
            lyric: '',
          },
        ],
      ]),
    )

    const html = await renderPortableTextToHtml(
      [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p-1' }],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<audio')
    expect(html).toContain('src="https://cdn/to.mp3"')
    expect(html).toContain('<img src="https://cdn/to.jpg" alt="Song" />')
    expect(html).toContain('Song')
    expect(html).toContain('Artist')
    expect(html).not.toContain('此文章包含音乐播放器')
  })

  it('collects music player ids nested in footnoteDefinition blocks', async () => {
    resolveMusicEmbeds.mockResolvedValue(new Map())
    await renderPortableTextToHtml(
      [
        {
          _type: 'footnoteDefinition',
          _key: 'fn1',
          index: 1,
          children: [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p-fn' }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(resolveMusicEmbeds).toHaveBeenCalledWith(['p-fn'])
  })
})

describe('render/pt-html — inline mark branches', () => {
  it('returns plain text when a mark name has no matching markDef', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'plain', marks: ['missing-mark'] }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toBe('<p>plain</p>')
  })

  it('falls back to tex in rss mode for a mathInline markDef without svg/mathml', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'a^2' }],
        },
      ],
      [],
      resolveMusicEmbeds,
      { rssMode: true },
    )
    expect(html).toContain('<code>a^2</code>')
  })

  it('falls back to tex on the web path when mathInline svg/mathml are empty', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'a^2', svg: '', mathml: '' }],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<code>a^2</code>')
  })
})

describe('render/pt-html — table header row', () => {
  it('emits <thead> from the first row when hasHeaderRow is true', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'table',
          _key: 't1',
          hasHeaderRow: true,
          rows: [
            {
              _type: 'tableRow',
              _key: 'r1',
              cells: [{ _type: 'tableCell', _key: 'c1', content: [{ _type: 'span', _key: 's1', text: 'H' }] }],
            },
            {
              _type: 'tableRow',
              _key: 'r2',
              cells: [{ _type: 'tableCell', _key: 'c2', content: [{ _type: 'span', _key: 's2', text: 'B' }] }],
            },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<thead>')
    expect(html).toContain('<tbody>')
    // header cell is always <th> in thead; body cell is <td> by default.
    expect(html).toContain('<th>H</th>')
    expect(html).toContain('<td>B</td>')
  })

  it('renders a header cell in tbody when isHeader is true on a body row', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'table',
          _key: 't1',
          hasHeaderRow: false,
          rows: [
            {
              _type: 'tableRow',
              _key: 'r1',
              cells: [
                { _type: 'tableCell', _key: 'c1', isHeader: true, content: [{ _type: 'span', _key: 's1', text: 'H' }] },
              ],
            },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('<th>H</th>')
  })

  it('uses markDefs fallback when a cell link is present inline', async () => {
    const html = await renderPortableTextToHtml(
      [
        {
          _type: 'table',
          _key: 't1',
          hasHeaderRow: false,
          rows: [
            {
              _type: 'tableRow',
              _key: 'r1',
              cells: [
                {
                  _type: 'tableCell',
                  _key: 'c1',
                  content: [{ _type: 'span', _key: 's1', text: 'go', marks: ['lk'] }],
                  markDefs: [{ _type: 'link', _key: 'lk', href: '/page' }],
                },
              ],
            },
          ],
        },
      ],
      [],
      resolveMusicEmbeds,
    )
    expect(html).toContain('href="/page"')
    expect(html).toContain('>go<')
  })
})
