import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/music/services/read', () => ({
  findMusicByPlayerIds: (db: unknown, ids: readonly string[]) => musicMockState.read(db, ids),
}))
vi.mock('@/server/domains/music/storage', () => ({
  safeBuildMusicPublicUrl: (path: string | null) => musicMockState.build(path),
}))

const musicMockState = {
  read: vi.fn<(db: unknown, ids: readonly string[]) => Promise<unknown[]>>(),
  build: vi.fn<(path: string | null) => string | null>(),
}

import { renderPortableTextToHtml } from '@/server/render/feed/feed-pt-render'

const fakeDb = {} as NodePgDatabase

beforeEach(() => {
  musicMockState.read.mockReset()
  musicMockState.build.mockReset()
  musicMockState.read.mockResolvedValue([])
})

describe('render/feed/feed-pt-render — renderPortableTextToHtml', () => {
  describe('text blocks', () => {
    it('wraps normal text in <p>', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'hello' }] }],
        [],
      )
      expect(html).toBe('<p>hello</p>')
    })

    it('renders headings with id derived from headingSlugs', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          { _type: 'block', _key: 'h1k', style: 'h1', children: [{ _type: 'span', _key: 's1', text: 'Intro' }] },
          { _type: 'block', _key: 'h2k', style: 'h2', children: [{ _type: 'span', _key: 's2', text: 'Sub' }] },
        ],
        ['intro-slug', 'sub-slug'],
      )
      expect(html).toContain('<h1 id="intro-slug">Intro</h1>')
      expect(html).toContain('<h2 id="sub-slug">Sub</h2>')
    })

    it('derives a slug from plain text when no heading slug is supplied', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'block', _key: 'h3k', style: 'h3', children: [{ _type: 'span', _key: 's1', text: 'A Title' }] }],
        [],
      )
      expect(html).toContain('id="a-title"')
    })

    it('renders blockquotes', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'bq',
            style: 'blockquote',
            children: [{ _type: 'span', _key: 's1', text: 'quoted' }],
          },
        ],
        [],
      )
      expect(html).toBe('<blockquote>quoted</blockquote>')
    })
  })

  describe('marks', () => {
    it('applies strong / em / underline / strike-through / code', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [
              { _type: 'span', _key: 's1', text: 'a', marks: ['strong'] },
              { _type: 'span', _key: 's2', text: 'b', marks: ['em'] },
              { _type: 'span', _key: 's3', text: 'c', marks: ['underline'] },
              { _type: 'span', _key: 's4', text: 'd', marks: ['strike-through'] },
              { _type: 'span', _key: 's5', text: 'e', marks: ['code'] },
            ],
          },
        ],
        [],
      )
      expect(html).toContain('<strong>a</strong>')
      expect(html).toContain('<em>b</em>')
      expect(html).toContain('<u>c</u>')
      expect(html).toContain('<s>d</s>')
      expect(html).toContain('<code>e</code>')
    })

    it('renders links with rel and target', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'click', marks: ['link1'] }],
            markDefs: [
              { _type: 'link', _key: 'link1', href: 'https://example.com', rel: 'noopener', target: '_blank' },
            ],
          },
        ],
        [],
      )
      expect(html).toContain('href="https://example.com"')
      expect(html).toContain('rel="noopener"')
      expect(html).toContain('target="_blank"')
    })

    it('renders footnote references as <sup>', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'note', marks: ['fn1'] }],
            markDefs: [{ _type: 'footnoteRef', _key: 'fn1', targetKey: 'fn1', index: 2 }],
          },
        ],
        [],
      )
      expect(html).toContain('<sup><a href="#user-content-fn-2">2</a></sup>')
    })
  })

  describe('image blocks', () => {
    it('renders a figure with src, alt, dimensions and caption', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'image',
            _key: 'img1',
            src: 'https://example.com/a.png',
            alt: 'alt text',
            width: 100,
            height: 50,
            caption: 'cap',
          },
        ],
        [],
      )
      expect(html).toContain('<figure><img src="https://example.com/a.png"')
      expect(html).toContain('alt="alt text"')
      expect(html).toContain('width="100"')
      expect(html).toContain('height="50"')
      expect(html).toContain('<figcaption>cap</figcaption>')
    })

    it('omits alt / width / height when not provided', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'image', _key: 'img2', src: 'https://example.com/b.png' }],
        [],
      )
      expect(html).not.toContain('alt=')
      expect(html).not.toContain('width=')
      expect(html).toContain('<img src="https://example.com/b.png"')
    })
  })

  describe('code blocks', () => {
    it('renders raw code wrapped in <pre><code>', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'code', _key: 'c1', code: 'const x = 1', language: 'typescript' }],
        [],
      )
      expect(html).toContain('<pre><code')
      expect(html).toContain('class="language-typescript"')
      expect(html).toContain('data-language="typescript"')
      expect(html).toContain('const x = 1')
    })

    it('uses highlightedHtml verbatim when provided', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'code', _key: 'c1', code: 'x', language: 'ts', highlightedHtml: '<span>hi</span>' }],
        [],
      )
      expect(html).toContain('<span>hi</span>')
    })

    it('wraps highlightedHtml in CDATA in RSS mode', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'code', _key: 'c1', code: 'x', language: 'ts', highlightedHtml: '<span>hi</span>' }],
        [],
        { rssMode: true },
      )
      expect(html).toContain('<![CDATA[<span>hi</span>]]>')
    })
  })

  describe('lists', () => {
    it('renders bullet and numbered lists', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'block',
            _key: 'l1',
            listItem: 'bullet',
            children: [{ _type: 'span', _key: 's1', text: 'one' }],
          },
          {
            _type: 'block',
            _key: 'l2',
            listItem: 'number',
            children: [{ _type: 'span', _key: 's2', text: 'two' }],
          },
        ],
        [],
      )
      expect(html).toContain('<ul>')
      expect(html).toContain('<li>one</li>')
      expect(html).toContain('<ol>')
      expect(html).toContain('<li>two</li>')
    })
  })

  describe('tables', () => {
    it('renders a table with header and body rows', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'table',
            _key: 't1',
            hasHeaderRow: true,
            rows: [
              {
                _type: 'tableRow',
                _key: 'r1',
                cells: [{ _type: 'tableCell', _key: 'c1', content: [{ _type: 'span', _key: 's1', text: 'Name' }] }],
              },
              {
                _type: 'tableRow',
                _key: 'r2',
                cells: [{ _type: 'tableCell', _key: 'c2', content: [{ _type: 'span', _key: 's2', text: 'Bob' }] }],
              },
            ],
          },
        ],
        [],
      )
      expect(html).toContain('<thead>')
      expect(html).toContain('<th>Name</th>')
      expect(html).toContain('<tbody>')
      expect(html).toContain('<td>Bob</td>')
    })
  })

  describe('math', () => {
    it('emits svg for math block when not in rss mode', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'mathBlock', _key: 'mb1', tex: '\\sum', svg: '<svg></svg>' }],
        [],
      )
      expect(html).toContain('<svg></svg>')
    })

    it('emits mathml when svg is empty', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'mathBlock', _key: 'mb2', tex: '\\sum', mathml: '<math></math>' }],
        [],
      )
      expect(html).toContain('<math></math>')
    })
  })

  describe('footnotes section', () => {
    it('renders a footnotes section when present', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'footnoteDefinition',
            _key: 'fd1',
            index: 1,
            children: [{ _type: 'block', _key: 'fb1', children: [{ _type: 'span', _key: 'fs1', text: 'see' }] }],
          },
        ],
        [],
      )
      expect(html).toContain('class="footnotes"')
      expect(html).toContain('id="user-content-fn-1"')
      expect(html).toContain('see')
      expect(html).toContain('↩')
    })
  })

  describe('two-column', () => {
    it('wraps columns in <div> when not rss mode', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'twoColumn',
            _key: 'tc1',
            left: [
              { _type: 'block', _key: 'lb1', style: 'normal', children: [{ _type: 'span', _key: 'ls1', text: 'L' }] },
            ],
            right: [
              { _type: 'block', _key: 'rb1', style: 'normal', children: [{ _type: 'span', _key: 'rs1', text: 'R' }] },
            ],
          },
        ],
        [],
      )
      expect(html).toContain('<div>')
      expect(html).toContain('<p>L</p>')
      expect(html).toContain('<p>R</p>')
    })

    it('flattens columns in rss mode', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'twoColumn',
            _key: 'tc2',
            left: [
              { _type: 'block', _key: 'lb1', style: 'normal', children: [{ _type: 'span', _key: 'ls1', text: 'L' }] },
            ],
            right: [
              { _type: 'block', _key: 'rb1', style: 'normal', children: [{ _type: 'span', _key: 'rs1', text: 'R' }] },
            ],
          },
        ],
        [],
        { rssMode: true },
      )
      expect(html).not.toContain('<div>')
      expect(html).toContain('<p>L</p><p>R</p>')
    })
  })

  describe('solution block', () => {
    it('renders children inline', async () => {
      const html = await renderPortableTextToHtml(
        fakeDb,
        [
          {
            _type: 'solution',
            _key: 'sol1',
            children: [
              {
                _type: 'block',
                _key: 'sb1',
                style: 'normal',
                children: [{ _type: 'span', _key: 'ss1', text: 'hidden' }],
              },
            ],
          },
        ],
        [],
      )
      expect(html).toContain('<p>hidden</p>')
    })
  })

  describe('horizontal rule', () => {
    it('renders an <hr />', async () => {
      const html = await renderPortableTextToHtml(fakeDb, [{ _type: 'horizontalRule', _key: 'hr1' }], [])
      expect(html).toContain('<hr />')
    })
  })

  describe('music player', () => {
    it('renders a placeholder when no music row is found', async () => {
      musicMockState.read.mockResolvedValue([])
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'musicPlayer', _key: 'mp1', playerId: 'player-x' }],
        [],
      )
      expect(html).toContain('此文章包含音乐播放器')
    })

    it('renders an <audio> tag when the player is resolved', async () => {
      musicMockState.read.mockResolvedValue([
        {
          id: 1n,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          source: 'manual',
          sourceId: null,
          playerId: 'player-x',
          name: 'Song',
          artist: 'Artist',
          album: null,
          audioStoragePath: 'music/song.mp3',
          coverStoragePath: null,
          lyric: null,
          uploaderId: null,
        },
      ])
      musicMockState.build.mockReturnValue('https://cdn.example.com/song.mp3')
      const html = await renderPortableTextToHtml(
        fakeDb,
        [{ _type: 'musicPlayer', _key: 'mp2', playerId: 'player-x' }],
        [],
      )
      expect(html).toContain('<audio')
      expect(html).toContain('Song')
      expect(html).toContain('Artist')
    })
  })
})
