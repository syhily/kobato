import { describe, expect, it, vi } from 'vitest'

// Server prerender products are deterministic sentinels marking server-recomputed bytes.
vi.mock('katex', () => ({
  default: {
    renderToString: (tex: string) => `<math>server:${tex}</math>`,
  },
}))
vi.mock('katex/contrib/mhchem', () => ({}))
vi.mock('@/server/infra/pt/shiki', () => ({
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
  SHIKI_SUPPORTED_LANGUAGES: new Set(['typescript', 'text']),
  createShikiHighlighter: () =>
    Promise.resolve({
      codeToHtml: (code: string) => `<pre>server:${code}</pre>`,
    }),
  shikiTransformers: () => [],
}))

import { emptyLexicalBody, lexicalBodyWith, lexicalMusicPlayer, lexicalParagraph } from '#/_helpers/lexical'
import { canonicalizeLexicalEditorState } from '@/server/domains/pt/services/lexical-canonicalize'
import { DomainError } from '@/server/infra/http/errors'

describe('pt/services/lexical-canonicalize — canonicalizeLexicalEditorState', () => {
  it('returns the validated state for valid input', async () => {
    const state = await canonicalizeLexicalEditorState(lexicalBodyWith([lexicalParagraph('Hello world')]))
    expect(state.root.children).toHaveLength(1)
    expect(state.root.children[0]).toMatchObject({ type: 'paragraph' })
  })

  it('accepts an empty body', async () => {
    const state = await canonicalizeLexicalEditorState(emptyLexicalBody())
    expect(state.root.children).toEqual([])
  })

  it('rejects non-state input with a BAD_REQUEST DomainError', async () => {
    const error = await canonicalizeLexicalEditorState(42).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'BAD_REQUEST', message: '正文格式不合法。' })
  })

  it('rejects a PortableText body (the pre-R9a wire shape)', async () => {
    const error = await canonicalizeLexicalEditorState([{ _type: 'block', _key: 'b1', children: [] }]).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('translates zod issues into the DomainError issues shape', async () => {
    const error = await canonicalizeLexicalEditorState(lexicalBodyWith([{ type: 'paragraph', version: 1 }])).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(DomainError)
    const { issues } = error as DomainError
    expect(Array.isArray(issues)).toBe(true)
    for (const issue of issues ?? []) {
      expect(typeof issue.message).toBe('string')
      expect(issue.path === undefined || issue.path.every((segment) => typeof segment === 'string')).toBe(true)
    }
  })

  // P0-10 parity: strip client-supplied prerender products and recompute server-side.
  describe('strips server-owned artifact slots', () => {
    it('drops client highlightedHtml/mathml/svg and recomputes them server-side', async () => {
      const state = await canonicalizeLexicalEditorState(
        lexicalBodyWith([
          {
            type: 'codeblock',
            version: 1,
            code: 'const x = 1',
            language: 'typescript',
            caption: '',
            highlightedHtml: '<span>client-code</span>',
          },
          { type: 'math', version: 1, tex: 'x^2', mathml: '<math>client-mathml</math>', svg: '<svg>client-svg</svg>' },
          { type: 'math-inline', version: 1, tex: 'y', mathml: '<math>client-inline</math>', svg: '<svg>c</svg>' },
        ]),
      )

      const [code, math, inline] = state.root.children as Record<string, unknown>[]
      expect(code!.highlightedHtml).toBe('<pre>server:const x = 1</pre>')
      expect(math!.mathml).toBe('<math>server:x^2</math>')
      expect(math!.svg).toBe('')
      expect(inline!.mathml).toBe('<math>server:y</math>')
      expect(inline!.svg).toBe('')
    })

    it('deletes the music-player meta snapshot keys (the snapshot pass re-embeds them later)', async () => {
      const state = await canonicalizeLexicalEditorState(
        lexicalBodyWith([
          lexicalMusicPlayer('p1', { name: 'forged', artist: 'forged', cover: 'x', audioUrl: 'x', lyric: 'x' }),
        ]),
      )

      const node = state.root.children[0] as Record<string, unknown>
      expect(node.playerId).toBe('p1')
      for (const key of ['name', 'artist', 'cover', 'audioUrl', 'lyric']) {
        expect(node).not.toHaveProperty(key)
      }
    })

    it('recomputes even when the client passed empty slots', async () => {
      const state = await canonicalizeLexicalEditorState(
        lexicalBodyWith([{ type: 'math', version: 1, tex: 'a+b', mathml: '', svg: '' }]),
      )
      expect((state.root.children[0] as Record<string, unknown>).mathml).toBe('<math>server:a+b</math>')
    })
  })
})
