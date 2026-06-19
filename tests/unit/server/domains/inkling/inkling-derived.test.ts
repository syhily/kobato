import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InklingBlockNode, InklingDocument, InklingInlineNode } from '@/shared/inkling/schema'

import { prerenderInklingMusicPlayers } from '@/server/domains/inkling/music-prerender'
import { prerenderInklingDocument } from '@/server/domains/inkling/prerender'

vi.mock('@/server/domains/music/services/read', () => ({
  getMusicMetaForPlayer: vi.fn(),
}))

import { getMusicMetaForPlayer } from '@/server/domains/music/services/read'

function text(value: string): InklingInlineNode {
  return { type: 'text', version: 1, text: value }
}

function makeDocument(rootChildren: InklingBlockNode[]): InklingDocument {
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
      children: rootChildren,
    },
  }
}

describe('server/domains/inkling/prerender — derived artifacts', () => {
  it('renders code blocks to highlightedHtml', async () => {
    const doc = makeDocument([{ type: 'code-block', version: 1, code: 'const x = 1', language: 'ts' }])
    const rendered = await prerenderInklingDocument(doc)
    const code = rendered.root.children[0]
    expect(code?.type).toBe('code-block')
    if (code?.type !== 'code-block') {
      throw new Error('expected code-block')
    }
    expect(code.highlightedHtml).toContain('<pre')
    expect(code.highlightedHtml).toContain('const')
  })

  it('renders math blocks to mathml', async () => {
    const doc = makeDocument([{ type: 'math-block', version: 1, tex: 'a^2 + b^2 = c^2' }])
    const rendered = await prerenderInklingDocument(doc)
    const math = rendered.root.children[0]
    expect(math?.type).toBe('math-block')
    if (math?.type !== 'math-block') {
      throw new Error('expected math-block')
    }
    expect(math.mathml).toContain('<math')
  })

  it('renders inline math to mathml', async () => {
    const doc = makeDocument([
      {
        type: 'paragraph',
        version: 1,
        children: [text('Energy '), { type: 'inline-math', version: 1, tex: 'E=mc^2' }],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const paragraph = rendered.root.children[0]
    expect(paragraph?.type).toBe('paragraph')
    if (paragraph?.type !== 'paragraph') {
      throw new Error('expected paragraph')
    }
    const inline = paragraph.children[1]
    expect(inline?.type).toBe('inline-math')
    if (inline?.type !== 'inline-math') {
      throw new Error('expected inline-math')
    }
    expect(inline.mathml).toContain('<math')
  })

  it('recurses into solution children', async () => {
    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'code-block', version: 1, code: 'nested', language: 'text' }],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const solution = rendered.root.children[0]
    expect(solution?.type).toBe('solution')
    if (solution?.type !== 'solution') {
      throw new Error('expected solution')
    }
    const code = solution.children[0]
    expect(code?.type).toBe('code-block')
    if (code?.type !== 'code-block') {
      throw new Error('expected code-block')
    }
    expect(code.highlightedHtml).toContain('<pre')
  })

  it('recurses into two-column left and right', async () => {
    const doc = makeDocument([
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'math-block', version: 1, tex: 'x' }],
        right: [{ type: 'code-block', version: 1, code: 'y', language: 'text' }],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const twoColumn = rendered.root.children[0]
    expect(twoColumn?.type).toBe('two-column')
    if (twoColumn?.type !== 'two-column') {
      throw new Error('expected two-column')
    }

    const leftMath = twoColumn.left[0]
    expect(leftMath?.type).toBe('math-block')
    if (leftMath?.type !== 'math-block') {
      throw new Error('expected math-block')
    }
    expect(leftMath.mathml).toContain('<math')

    const rightCode = twoColumn.right[0]
    expect(rightCode?.type).toBe('code-block')
    if (rightCode?.type !== 'code-block') {
      throw new Error('expected code-block')
    }
    expect(rightCode.highlightedHtml).toContain('<pre')
  })

  it('recurses into footnote definitions', async () => {
    const doc = makeDocument([
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'code-block', version: 1, code: 'fn', language: 'text' }],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const footnote = rendered.root.children[0]
    expect(footnote?.type).toBe('footnote-definition')
    if (footnote?.type !== 'footnote-definition') {
      throw new Error('expected footnote-definition')
    }
    const code = footnote.children[0]
    expect(code?.type).toBe('code-block')
    if (code?.type !== 'code-block') {
      throw new Error('expected code-block')
    }
    expect(code.highlightedHtml).toContain('<pre')
  })

  it('does not render inline math inside table cells', async () => {
    const doc = makeDocument([
      {
        type: 'table',
        version: 1,
        rows: [
          {
            type: 'tablerow',
            version: 1,
            cells: [
              {
                type: 'tablecell',
                version: 1,
                children: [{ type: 'inline-math', version: 1, tex: 'x' }],
              },
            ],
          },
        ],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const table = rendered.root.children[0]
    expect(table?.type).toBe('table')
    if (table?.type !== 'table') {
      throw new Error('expected table')
    }
    const inline = table.rows[0]?.cells[0]?.children[0]
    expect(inline?.type).toBe('inline-math')
    if (inline?.type !== 'inline-math') {
      throw new Error('expected inline-math')
    }
    expect(inline.mathml).toBeUndefined()
  })

  it('overwrites stale artifacts instead of preserving them', async () => {
    const doc = makeDocument([
      { type: 'code-block', version: 1, code: 'x', highlightedHtml: '<pre>existing</pre>' },
      { type: 'math-block', version: 1, tex: 'x', mathml: '<math>existing</math>' },
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'inline-math', version: 1, tex: 'x', mathml: '<math>existing</math>' }],
      },
    ])
    const rendered = await prerenderInklingDocument(doc)
    const code = rendered.root.children[0]
    expect(code?.type).toBe('code-block')
    if (code?.type !== 'code-block') {
      throw new Error('expected code-block')
    }
    expect(code.highlightedHtml).not.toBe('<pre>existing</pre>')
    expect(code.highlightedHtml).toContain('<pre')

    const math = rendered.root.children[1]
    expect(math?.type).toBe('math-block')
    if (math?.type !== 'math-block') {
      throw new Error('expected math-block')
    }
    expect(math.mathml).not.toBe('<math>existing</math>')
    expect(math.mathml).toContain('<math')

    const paragraph = rendered.root.children[2]
    expect(paragraph?.type).toBe('paragraph')
    if (paragraph?.type !== 'paragraph') {
      throw new Error('expected paragraph')
    }
    const inline = paragraph.children[0]
    expect(inline?.type).toBe('inline-math')
    if (inline?.type !== 'inline-math') {
      throw new Error('expected inline-math')
    }
    expect(inline.mathml).not.toBe('<math>existing</math>')
    expect(inline.mathml).toContain('<math')
  })
})

describe('server/domains/inkling/music-prerender — read-time metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injects metadata for music cards and leaves missing metadata unchanged', async () => {
    const mockedGetMusicMetaForPlayer = vi.mocked(getMusicMetaForPlayer)
    mockedGetMusicMetaForPlayer.mockImplementation(async (_db, playerId) => {
      if (playerId === 'known') {
        return {
          id: 'known',
          name: 'Known Song',
          artist: 'Known Artist',
          album: 'Known Album',
          url: 'https://cdn.example/known.mp3',
          pic: 'https://cdn.example/known.jpg',
          lyric: '',
        }
      }
      return null
    })

    const doc = makeDocument([
      { type: 'music-card', version: 1, playerId: 'known' },
      { type: 'music-card', version: 1, playerId: 'missing' },
    ])

    const rendered = await prerenderInklingMusicPlayers({} as never, doc)
    expect(rendered).not.toBeNull()
    if (rendered === null) {
      throw new Error('expected rendered document')
    }

    const known = rendered.root.children[0]
    expect(known?.type).toBe('music-card')
    if (known?.type !== 'music-card') {
      throw new Error('expected music-card')
    }
    expect(known.meta).toEqual({
      id: 'known',
      name: 'Known Song',
      artist: 'Known Artist',
      cover: 'https://cdn.example/known.jpg',
      audioUrl: 'https://cdn.example/known.mp3',
      lyric: '',
    })

    const missing = rendered.root.children[1]
    expect(missing?.type).toBe('music-card')
    if (missing?.type !== 'music-card') {
      throw new Error('expected music-card')
    }
    expect(missing.meta).toBeUndefined()

    expect(mockedGetMusicMetaForPlayer).toHaveBeenCalledTimes(2)
  })

  it('resolves music cards nested in solution, two-column, and footnote-definition', async () => {
    const mockedGetMusicMetaForPlayer = vi.mocked(getMusicMetaForPlayer)
    mockedGetMusicMetaForPlayer.mockResolvedValue({
      id: 'nested',
      name: 'Nested Song',
      artist: 'Nested Artist',
      album: 'Nested Album',
      url: 'https://cdn.example/nested.mp3',
      pic: 'https://cdn.example/nested.jpg',
      lyric: '',
    })

    const doc = makeDocument([
      {
        type: 'solution',
        version: 1,
        children: [{ type: 'music-card', version: 1, playerId: 'nested' }],
      },
      {
        type: 'two-column',
        version: 1,
        left: [{ type: 'music-card', version: 1, playerId: 'nested' }],
        right: [],
      },
      {
        type: 'footnote-definition',
        version: 1,
        targetKey: 'fn1',
        index: 1,
        children: [{ type: 'music-card', version: 1, playerId: 'nested' }],
      },
    ])

    const rendered = await prerenderInklingMusicPlayers({} as never, doc)
    expect(rendered).not.toBeNull()
    if (rendered === null) {
      throw new Error('expected rendered document')
    }

    const solution = rendered.root.children[0]
    expect(solution?.type).toBe('solution')
    if (solution?.type !== 'solution') {
      throw new Error('expected solution')
    }
    const solutionMusic = solution.children[0]
    expect(solutionMusic?.type).toBe('music-card')
    if (solutionMusic?.type !== 'music-card') {
      throw new Error('expected music-card in solution')
    }
    expect(solutionMusic.meta).toBeDefined()

    const twoColumn = rendered.root.children[1]
    expect(twoColumn?.type).toBe('two-column')
    if (twoColumn?.type !== 'two-column') {
      throw new Error('expected two-column')
    }
    const leftMusic = twoColumn.left[0]
    expect(leftMusic?.type).toBe('music-card')
    if (leftMusic?.type !== 'music-card') {
      throw new Error('expected music-card in two-column left')
    }
    expect(leftMusic.meta).toBeDefined()

    const footnote = rendered.root.children[2]
    expect(footnote?.type).toBe('footnote-definition')
    if (footnote?.type !== 'footnote-definition') {
      throw new Error('expected footnote-definition')
    }
    const footnoteMusic = footnote.children[0]
    expect(footnoteMusic?.type).toBe('music-card')
    if (footnoteMusic?.type !== 'music-card') {
      throw new Error('expected music-card in footnote')
    }
    expect(footnoteMusic.meta).toBeDefined()

    // Three unique references but only one unique playerId, so one batch fetch.
    expect(mockedGetMusicMetaForPlayer).toHaveBeenCalledTimes(1)
  })
})
