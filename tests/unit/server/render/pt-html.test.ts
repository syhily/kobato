import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'

vi.mock('@/server/infra/slug/derive', () => ({
  deriveSlug: vi.fn((text: string) => `slug-${text}`),
}))

vi.mock('@/shared/config/getters', () => ({
  requireBlogSettingsSection: vi.fn((section: string) =>
    section === 'siteIdentity' ? { website: 'https://example.com' } : {},
  ),
}))

// NOTE: the heading-slot collector and the slots→slug zip are NOT mocked —
// the suite exercises the real single-owned modules in `@/shared/pt/utils`
// (the mock that reimplemented them was removed when ownership moved).

vi.mock('@/shared/utils/footnotes-section-title', () => ({
  resolveFootnotesSectionTitle: vi.fn(() => 'Footnotes'),
}))

import { renderPortableTextToHtml } from '@/server/render/pt-html'

// The music meta lookup arrives through the injected PT embed seam, so the
// suite stubs the resolver directly — no module mock of the music domain.
const resolveMusicEmbeds = vi.fn<MusicEmbedResolver>()

describe('renderPortableTextToHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMusicEmbeds.mockResolvedValue(
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Song',
            artist: 'Artist',
            album: 'Album',
            url: 'https://cdn.example.com/song.mp3',
            pic: 'https://cdn.example.com/song.jpg',
            lyric: '',
          },
        ],
      ]),
    )
  })

  it('renders a full portable text body into html', async () => {
    const body = [
      {
        _type: 'block',
        _key: 'h1',
        style: 'h1',
        children: [{ _type: 'span', _key: 's1', text: 'Title', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's2', text: 'Hello ', marks: [] },
          { _type: 'span', _key: 's3', text: 'world', marks: ['strong'] },
          { _type: 'span', _key: 's4', text: ' link', marks: ['m1'] },
        ],
        markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.com', rel: 'nofollow', target: '_blank' }],
      },
      {
        _type: 'image',
        _key: 'img1',
        src: 'https://cdn.example.com/a.jpg',
        alt: 'Alt text',
        width: 800,
        height: 600,
        caption: 'A caption',
      },
      {
        _type: 'code',
        _key: 'code1',
        language: 'ts',
        code: 'const x = 1',
      },
      {
        _type: 'mathBlock',
        _key: 'math1',
        tex: 'E = mc^2',
        svg: '<svg>E=mc²</svg>',
      },
      { _type: 'horizontalRule', _key: 'hr1' },
      {
        _type: 'musicPlayer',
        _key: 'music1',
        playerId: 'p1',
      },
      {
        _type: 'table',
        _key: 'table1',
        hasHeaderRow: true,
        rows: [
          {
            cells: [
              { content: [{ _key: 'c1', text: 'Name', marks: [] }], isHeader: true },
              { content: [{ _key: 'c2', text: 'Value', marks: [] }], isHeader: true },
            ],
          },
          {
            cells: [
              { content: [{ _key: 'c3', text: 'A', marks: [] }] },
              { content: [{ _key: 'c4', text: 'B', marks: [] }] },
            ],
          },
        ],
      },
      {
        _type: 'twoColumn',
        _key: 'two1',
        left: [
          {
            _type: 'block',
            _key: 'left1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'ls1', text: 'Left', marks: [] }],
          },
        ],
        right: [
          {
            _type: 'block',
            _key: 'right1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'rs1', text: 'Right', marks: [] }],
          },
        ],
      },
      {
        _type: 'solution',
        _key: 'sol1',
        children: [
          {
            _type: 'block',
            _key: 'solb1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'ss1', text: 'Answer', marks: [] }],
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
            _key: 'fnb1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'fs1', text: 'Note', marks: [] }],
          },
        ],
      },
    ]

    const html = await renderPortableTextToHtml(body as never, ['custom-title'], resolveMusicEmbeds)

    expect(html).toContain('<h1 id="custom-title">Title</h1>')
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('<figure><img')
    expect(html).toContain('<pre><code')
    expect(html).toContain('<svg>E=mc²</svg>')
    expect(html).toContain('<hr />')
    expect(html).toContain('<audio controls')
    expect(html).toContain('<table>')
    expect(html).toContain('Left')
    expect(html).toContain('Right')
    expect(html).toContain('Answer')
    expect(html).toContain('footnotes')
  })

  it('renders in rss mode without interactive markup', async () => {
    const body = [
      {
        _type: 'block',
        _key: 'h2',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: 'Section', marks: [] }],
      },
      {
        _type: 'mathBlock',
        _key: 'math1',
        tex: 'a^2',
      },
      {
        _type: 'twoColumn',
        _key: 'two1',
        left: [
          {
            _type: 'block',
            _key: 'l1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'ls', text: 'L', marks: [] }],
          },
        ],
        right: [
          {
            _type: 'block',
            _key: 'r1',
            style: 'normal',
            children: [{ _type: 'span', _key: 'rs', text: 'R', marks: [] }],
          },
        ],
      },
    ]

    const html = await renderPortableTextToHtml(body as never, [], resolveMusicEmbeds, { rssMode: true })

    expect(html).toContain('Section')
    expect(html).toContain('<pre><code>a^2</code></pre>')
    expect(html).toContain('L')
    expect(html).toContain('R')
  })

  it('falls back to placeholder when music player metadata is missing', async () => {
    resolveMusicEmbeds.mockResolvedValue(new Map())
    const body = [{ _type: 'musicPlayer', _key: 'm1', playerId: 'missing' }]
    const html = await renderPortableTextToHtml(body as never, [], resolveMusicEmbeds)
    expect(html).toContain('此文章包含音乐播放器')
  })

  it('renders the resolved cover as an <img>, absolutizing the relative default cover', async () => {
    resolveMusicEmbeds.mockResolvedValue(
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Song',
            artist: 'Artist',
            album: 'Album',
            url: 'https://cdn.example.com/song.mp3',
            pic: '/images/default-music-cover.png',
            lyric: '',
          },
        ],
      ]),
    )
    const body = [{ _type: 'musicPlayer', _key: 'm1', playerId: 'p1' }]
    const html = await renderPortableTextToHtml(body as never, [], resolveMusicEmbeds)
    expect(html).toContain('<img src="https://example.com/images/default-music-cover.png" alt="Song" />')
    expect(html).toContain('<audio controls preload="none" src="https://cdn.example.com/song.mp3"></audio>')
  })

  it('covers edge cases for inline marks and block renderers', async () => {
    const body = [
      {
        _type: 'block',
        _key: 'p2',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's1', text: 'emphasis', marks: ['em'] },
          { _type: 'span', _key: 's2', text: 'code', marks: ['code'] },
          { _type: 'span', _key: 's3', text: 'strike', marks: ['strike-through'] },
          { _type: 'span', _key: 's4', text: 'underline', marks: ['underline'] },
          { _type: 'span', _key: 's5', text: 'math', marks: ['m2'] },
          { _type: 'span', _key: 's6', text: 'fn', marks: ['m3'] },
          { _type: 'span', _key: 's7', text: 'badmark', marks: ['unknown'] },
        ],
        markDefs: [
          { _key: 'm2', _type: 'mathInline', tex: 'x^2', svg: '<svg>x²</svg>' },
          { _key: 'm3', _type: 'footnoteRef', index: 2 },
        ],
      },
      {
        _type: 'block',
        _key: 'p3',
        style: 'normal',
        children: [{ _type: 'span', _key: 's8', text: 'javascript link', marks: ['m4'] }],
        markDefs: [{ _key: 'm4', _type: 'link', href: 'javascript:alert(1)' }],
      },
      {
        _type: 'image',
        _key: 'img2',
        src: 'https://cdn.example.com/b.jpg',
      },
      {
        _type: 'code',
        _key: 'code2',
        highlightedHtml: '<span>hi</span>',
      },
      {
        _type: 'mathBlock',
        _key: 'math2',
        tex: 'y',
        mathml: '<math>y</math>',
      },
      {
        _type: 'table',
        _key: 'table2',
        hasHeaderRow: false,
        rows: [
          {
            cells: [{ content: [{ _key: 'c1', text: 'Only', marks: [] }] }],
          },
        ],
      },
      {
        _type: 'block',
        _key: 'li1',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 'ls1', text: 'Bullet', marks: [] }],
      },
    ]

    const html = await renderPortableTextToHtml(body as never, [], resolveMusicEmbeds)

    expect(html).toContain('<em>emphasis</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<s>strike</s>')
    expect(html).toContain('<u>underline</u>')
    expect(html).toContain('<svg>x²</svg>')
    expect(html).toContain('user-content-fn-2')
    expect(html).toContain('href="#"')
    expect(html).toContain('<figure><img src="https://cdn.example.com/b.jpg" /></figure>')
    expect(html).toContain('<span>hi</span>')
    expect(html).toContain('<math>y</math>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<li>Bullet</li>')
  })

  it('renders rss mode for math inline and code blocks', async () => {
    const body = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'math', marks: ['m1'] }],
        markDefs: [{ _key: 'm1', _type: 'mathInline', tex: 'a', svg: '<svg>a</svg>' }],
      },
      {
        _type: 'code',
        _key: 'code1',
        language: 'ts',
        highlightedHtml: '<b>code</b>',
      },
    ]
    const html = await renderPortableTextToHtml(body as never, [], resolveMusicEmbeds, { rssMode: true })
    expect(html).toContain('<code>a</code>')
    expect(html).toContain('<![CDATA[<b>code</b>]]>')
  })
})
