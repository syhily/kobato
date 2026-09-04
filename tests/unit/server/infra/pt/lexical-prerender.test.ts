import { describe, expect, it, vi } from 'vitest'

// Server prerender products are deterministic sentinels marking server-recomputed bytes.
vi.mock('katex', () => ({
  default: {
    renderToString: (tex: string, options?: { displayMode?: boolean }) =>
      `<math data-display="${options?.displayMode === true ? 'block' : 'inline'}">server:${tex}</math>`,
  },
}))
vi.mock('katex/contrib/mhchem', () => ({}))
vi.mock('@/server/infra/pt/shiki', () => ({
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
  SHIKI_SUPPORTED_LANGUAGES: new Set(['typescript', 'text']),
  createShikiHighlighter: () =>
    Promise.resolve({
      codeToHtml: (code: string, options?: { lang?: string }) =>
        `<pre data-lang="${options?.lang}">server:${code}</pre>`,
    }),
  shikiTransformers: () => [],
}))

import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// zod parse clones — always assert against the PARSED state's nodes.
function parse(state: unknown) {
  return lexicalEditorStateSchema.parse(state)
}

function at(state: ReturnType<typeof parse>, ...path: number[]): Record<string, unknown> {
  let node: Record<string, unknown> = state.root as unknown as Record<string, unknown>
  for (const index of path) {
    node = (node.children as Record<string, unknown>[])[index]!
  }
  return node
}

describe('infra/pt/lexical-prerender — prerenderLexicalEditorState', () => {
  it('returns the state untouched when no artifact slot is pending', async () => {
    const state = parse(lexicalBodyWith([lexicalParagraph('plain')]))
    const result = await prerenderLexicalEditorState(state)
    expect(result).toBe(state)
  })

  it('fills empty mathml on math and math-inline nodes, leaving svg stripped (PT parity)', async () => {
    const state = parse(
      lexicalBodyWith([
        { type: 'math', version: 1, tex: 'E=mc^2', mathml: '', svg: '' },
        lexicalParagraph('p'),
        { type: 'math-inline', version: 1, tex: 'x^2', mathml: '', svg: '' },
      ]),
    )

    await prerenderLexicalEditorState(state)

    expect(at(state, 0).mathml).toBe('<math data-display="block">server:E=mc^2</math>')
    expect(at(state, 2).mathml).toBe('<math data-display="inline">server:x^2</math>')
    expect(at(state, 0).svg).toBe('')
    expect(at(state, 2).svg).toBe('')
  })

  it('skips math nodes with empty tex or already-filled mathml', async () => {
    const state = parse(
      lexicalBodyWith([
        { type: 'math', version: 1, tex: '', mathml: '', svg: '' },
        { type: 'math', version: 1, tex: 'y', mathml: '<math>kept</math>', svg: '' },
      ]),
    )

    await prerenderLexicalEditorState(state)

    expect(at(state, 0).mathml).toBe('')
    expect(at(state, 1).mathml).toBe('<math>kept</math>')
  })

  it('fills empty highlightedHtml on codeblock nodes', async () => {
    const state = parse(
      lexicalBodyWith([
        {
          type: 'codeblock',
          version: 1,
          code: 'const a = 1',
          language: 'typescript',
          caption: '',
          highlightedHtml: '',
        },
      ]),
    )

    await prerenderLexicalEditorState(state)

    expect(at(state, 0).highlightedHtml).toBe('<pre data-lang="typescript">server:const a = 1</pre>')
  })

  it('falls back to the text lang for unsupported languages and skips filled/empty blocks', async () => {
    const state = parse(
      lexicalBodyWith([
        { type: 'codeblock', version: 1, code: 'x', language: 'brainfuck', caption: '', highlightedHtml: '' },
        {
          type: 'codeblock',
          version: 1,
          code: 'y',
          language: 'typescript',
          caption: '',
          highlightedHtml: '<pre>kept</pre>',
        },
        { type: 'codeblock', version: 1, code: '', language: '', caption: '', highlightedHtml: '' },
      ]),
    )

    await prerenderLexicalEditorState(state)

    expect(at(state, 0).highlightedHtml).toBe('<pre data-lang="text">server:x</pre>')
    expect(at(state, 1).highlightedHtml).toBe('<pre>kept</pre>')
    expect(at(state, 2).highlightedHtml).toBe('')
  })

  it('reaches nodes nested inside element containers', async () => {
    const state = parse(
      lexicalBodyWith([
        {
          type: 'extended-quote',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'math-inline', version: 1, tex: 'z', mathml: '', svg: '' }],
        },
      ]),
    )

    await prerenderLexicalEditorState(state)

    expect(at(state, 0, 0).mathml).toBe('<math data-display="inline">server:z</math>')
  })
})
