import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Companion to pt-html.test.ts — focuses on the RSS-mode and
// edge-config branches that the main spec doesn't exercise.

vi.mock('@/server/domains/music/services/read', () => ({
  getPublicMusicMetasByIds: (db: unknown, ids: readonly string[]) => musicMockState.read(db, ids),
}))

const musicMockState = {
  read: vi.fn<(db: unknown, ids: readonly string[]) => Promise<Map<string, unknown>>>(),
}

import { renderPortableTextToHtml } from '@/server/render/pt-html'

const fakeDb = {} as NodePgDatabase

beforeEach(() => {
  musicMockState.read.mockReset()
  musicMockState.read.mockResolvedValue(new Map())
})

describe('render/pt-html — RSS-mode branches', () => {
  it('renders math block as escaped TeX inside <code> in RSS mode', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [{ _type: 'mathBlock', _key: 'm1', tex: '\\frac{1}{2}', svg: '<svg></svg>' }],
      [],
      { rssMode: true },
    )
    // RSS mode bypasses svg/mathml entirely.
    expect(html).not.toContain('<svg></svg>')
    expect(html).toContain('<code>')
    expect(html).toContain('\\frac')
  })

  it('renders math block as <pre><code>TeX</code></pre> when svg and mathml are both empty', async () => {
    const html = await renderPortableTextToHtml(fakeDb, [{ _type: 'mathBlock', _key: 'm2', tex: 'x^2' }], [])
    expect(html).toBe('<pre><code>x^2</code></pre>')
  })

  it('wraps inline math mark in <code>tex</code> when in RSS mode', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'plain', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: '\\pi', svg: '<svg>x</svg>' }],
        },
      ],
      [],
      { rssMode: true },
    )
    // RSS: svg is ignored, tex wins.
    expect(html).not.toContain('<svg>x</svg>')
    expect(html).toContain('<code>\\pi</code>')
  })

  it('falls back to children text when an inline math mark has no tex', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'fallback', marks: ['m1'] }],
          markDefs: [{ _type: 'mathInline', _key: 'm1', tex: '' }],
        },
      ],
      [],
      { rssMode: true },
    )
    expect(html).toContain('<code>fallback</code>')
  })
})

describe('render/pt-html — code-block edge branches', () => {
  it('omits the language class when language is empty', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [{ _type: 'code', _key: 'c1', code: 'plain', language: '' }],
      [],
    )
    expect(html).not.toContain('class="language-')
    expect(html).not.toContain('data-language=')
    expect(html).toContain('plain')
  })

  it('falls back to escaped code when highlightedHtml is empty', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [{ _type: 'code', _key: 'c1', code: '<script>', language: 'html', highlightedHtml: '' }],
      [],
    )
    // No raw HTML leaked — the code body is escaped.
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('emits raw highlightedHtml (no CDATA) in non-rss mode', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [{ _type: 'code', _key: 'c1', code: 'x', language: 'ts', highlightedHtml: '<span>hl</span>' }],
      [],
    )
    expect(html).toContain('<span>hl</span>')
    expect(html).not.toContain('<![CDATA[')
  })
})

describe('render/pt-html — link sanitizer', () => {
  it('rewrites javascript: hrefs to "#" to defeat RSS-reader script injection', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['lk'] }],
          markDefs: [{ _type: 'link', _key: 'lk', href: 'javascript:alert(1)' }],
        },
      ],
      [],
    )
    expect(html).toContain('href="#"')
    expect(html).not.toContain('alert(1)')
  })

  it('rewrites data: hrefs to "#" too', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['lk'] }],
          markDefs: [{ _type: 'link', _key: 'lk', href: 'data:text/html,<script>' }],
        },
      ],
      [],
    )
    expect(html).toContain('href="#"')
  })

  it('rewrites control-character smuggled hrefs (java\\tscript:) to "#"', async () => {
    // Browsers strip C0 control chars when parsing the protocol, so
    // `java\tscript:` IS `javascript:` at runtime — must be neutralised.
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['lk'] }],
          markDefs: [{ _type: 'link', _key: 'lk', href: 'java\tscript:alert(1)' }],
        },
      ],
      [],
    )
    expect(html).toContain('href="#"')
    expect(html).not.toContain('alert(1)')
  })

  it('keeps a relative href without rel/target when those are absent', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'go', marks: ['lk'] }],
          markDefs: [{ _type: 'link', _key: 'lk', href: '/post/1' }],
        },
      ],
      [],
    )
    expect(html).toContain('href="/post/1"')
    expect(html).not.toContain('rel=')
    expect(html).not.toContain('target=')
  })
})

describe('render/pt-html — table without header', () => {
  it('emits only <tbody> when hasHeaderRow is false', async () => {
    const html = await renderPortableTextToHtml(
      fakeDb,
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
                { _type: 'tableCell', _key: 'c1', content: [{ _type: 'span', _key: 's1', text: 'a' }] },
                {
                  _type: 'tableCell',
                  _key: 'c2',
                  isHeader: true,
                  content: [{ _type: 'span', _key: 's2', text: 'b' }],
                },
              ],
            },
          ],
        },
      ],
      [],
    )
    expect(html).not.toContain('<thead>')
    expect(html).toContain('<tbody>')
    // isHeader cell renders as <th>, body cell renders as <td>.
    expect(html).toContain('<td>a</td>')
    expect(html).toContain('<th>b</th>')
  })

  it('renders an empty table when rows are absent', async () => {
    const html = await renderPortableTextToHtml(fakeDb, [{ _type: 'table', _key: 't1', rows: [] }], [])
    expect(html).toBe('<table><tbody></tbody></table>')
  })
})

describe('render/pt-html — music placeholder branches', () => {
  it('renders a placeholder inside a twoColumn block when no music row resolves', async () => {
    musicMockState.read.mockResolvedValue(new Map())
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'twoColumn',
          _key: 'tc1',
          left: [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p-left' }],
          right: [{ _type: 'musicPlayer', _key: 'mp2', playerId: 'p-right' }],
        },
      ],
      [],
    )
    // Both players collected (two distinct ids) but neither resolved.
    expect(musicMockState.read).toHaveBeenCalledWith(fakeDb, ['p-left', 'p-right'])
    expect(html).toContain('此文章包含音乐播放器')
  })

  it('renders a placeholder inside a solution block when the music row is missing', async () => {
    musicMockState.read.mockResolvedValue(new Map())
    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        {
          _type: 'solution',
          _key: 's1',
          children: [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'p-sol' }],
        },
      ],
      [],
    )
    expect(musicMockState.read).toHaveBeenCalledWith(fakeDb, ['p-sol'])
    expect(html).toContain('此文章包含音乐播放器')
  })

  it('renders the player for resolved ids and the placeholder for ids missing from the meta map', async () => {
    musicMockState.read.mockResolvedValue(
      new Map([
        [
          'p-ok',
          {
            id: 'p-ok',
            name: 'Song',
            artist: 'Artist',
            album: 'Album',
            url: 'https://cdn.example.com/ok.mp3',
            pic: 'https://cdn.example.com/ok.jpg',
            lyric: '',
          },
        ],
      ]),
    )

    const html = await renderPortableTextToHtml(
      fakeDb,
      [
        { _type: 'musicPlayer', _key: 'mp1', playerId: 'p-ok' },
        { _type: 'musicPlayer', _key: 'mp2', playerId: 'p-missing' },
      ],
      [],
    )
    expect(html).toContain('<audio controls preload="none" src="https://cdn.example.com/ok.mp3"></audio>')
    expect(html).toContain('<img src="https://cdn.example.com/ok.jpg" alt="Song" />')
    expect(html).toContain('此文章包含音乐播放器')
  })
})
