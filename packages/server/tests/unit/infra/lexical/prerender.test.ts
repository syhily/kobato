import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('katex', () => ({
  default: {
    renderToString: (tex: string) => prerenderState.katex(tex),
  },
}))
vi.mock('katex/contrib/mhchem', () => ({}))
vi.mock('@kobato/server/infra/markup/shiki', () => ({
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
  SHIKI_SUPPORTED_LANGUAGES: new Set(['typescript', 'tsx', 'text']),
  createShikiHighlighter: () => prerenderState.shiki(),
  shikiTransformers: () => [],
}))

import type { LexicalBody } from '@kobato/shared/lexical/schema'

const prerenderState = {
  shiki: vi.fn(() =>
    Promise.resolve({
      codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
    }),
  ),
  katex: vi.fn((tex: string) => `<math>${tex}</math>`),
}

import { prerenderLexicalBody } from '@kobato/server/infra/lexical/prerender'

beforeEach(() => {
  prerenderState.shiki.mockReset()
  prerenderState.katex.mockReset()
  prerenderState.shiki.mockResolvedValue({ codeToHtml: (code: string) => `<pre><code>${code}</code></pre>` })
  prerenderState.katex.mockImplementation((tex: string) => `<math>${tex}</math>`)
})

function base(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { direction: null, format: '', indent: 0, version: 1, ...extra }
}

function textNode(text: string) {
  return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function body(children: unknown[]): LexicalBody {
  return { root: base({ type: 'root', children }) } as unknown as LexicalBody
}

describe('infra/lexical/prerender — prerenderLexicalBody', () => {
  it('returns the body unchanged when there are no code or math nodes', async () => {
    const b = body([base({ type: 'paragraph', children: [textNode('hi')] })])
    const result = await prerenderLexicalBody(b)
    expect(result).toBe(b)
    expect(prerenderState.shiki).not.toHaveBeenCalled()
    expect(prerenderState.katex).not.toHaveBeenCalled()
  })

  it('skips code nodes with empty text or pre-rendered html', async () => {
    const b = body([
      base({ type: 'code', children: [] }),
      base({ type: 'code', language: 'ts', highlightedHtml: '<existing>', children: [textNode('x')] }),
    ])
    const result = await prerenderLexicalBody(b)
    expect(result).toBe(b)
    expect(prerenderState.shiki).not.toHaveBeenCalled()
  })

  it('writes highlightedHtml into code nodes with a known language', async () => {
    const b = body([base({ type: 'code', language: 'ts', children: [textNode('const a = 1')] })])
    const result = await prerenderLexicalBody(b)
    expect(result).toBe(b)
    const code = result.root.children[0] as { highlightedHtml?: string }
    expect(code.highlightedHtml).toBe('<pre><code>const a = 1</code></pre>')
    expect(prerenderState.shiki).toHaveBeenCalledTimes(1)
    expect(prerenderState.katex).not.toHaveBeenCalled()
  })

  it('falls back to the text language for unsupported languages', async () => {
    const b = body([base({ type: 'code', language: 'unknown-lang', children: [textNode('x')] })])
    const result = await prerenderLexicalBody(b)
    const code = result.root.children[0] as { highlightedHtml?: string }
    expect(code.highlightedHtml).toBe('<pre><code>x</code></pre>')
  })

  it('writes mathml into mathBlock and mathInline nodes', async () => {
    const b = body([
      base({
        type: 'paragraph',
        children: [textNode('a '), { type: 'mathInline', version: 1, tex: 'x^2' }, textNode(' b')],
      }),
      base({ type: 'mathBlock', tex: 'y=1' }),
    ])
    const result = await prerenderLexicalBody(b)
    expect(prerenderState.katex).toHaveBeenCalledTimes(2)
    const paragraph = result.root.children[0] as { children: Array<{ type: string; mathml?: string }> }
    expect(paragraph.children[1]).toMatchObject({ type: 'mathInline', mathml: '<math>x^2</math>' })
    const block = result.root.children[1] as { mathml?: string }
    expect(block.mathml).toBe('<math>y=1</math>')
  })

  it('skips math nodes with empty tex or pre-rendered mathml', async () => {
    const b = body([base({ type: 'mathBlock', tex: '' }), base({ type: 'mathBlock', tex: 'x', mathml: '<existing>' })])
    await prerenderLexicalBody(b)
    expect(prerenderState.katex).not.toHaveBeenCalled()
  })

  it('reaches code nodes nested inside containers', async () => {
    const b = body([
      base({
        type: 'solution',
        children: [base({ type: 'code', language: 'ts', children: [textNode('nested')] })],
      }),
    ])
    const result = await prerenderLexicalBody(b)
    const solution = result.root.children[0] as { children: Array<{ highlightedHtml?: string }> }
    expect(solution.children[0]?.highlightedHtml).toBe('<pre><code>nested</code></pre>')
  })
})
