import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('katex', () => ({
  default: {
    renderToString: (tex: string) => prerenderState.katex(tex),
  },
}))
vi.mock('katex/contrib/mhchem', () => ({}))
vi.mock('@/server/infra/pt/shiki', () => ({
  SHIKI_THEMES: { light: 'github-light', dark: 'github-dark' },
  SHIKI_SUPPORTED_LANGUAGES: new Set(['typescript', 'tsx', 'text']),
  createShikiHighlighter: () => prerenderState.shiki(),
  shikiTransformers: () => [],
}))

import type { PortableTextBody } from '@/shared/pt/schema'

const prerenderState = {
  shiki: vi.fn(() =>
    Promise.resolve({
      codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
    }),
  ),
  katex: vi.fn((tex: string) => `<math>${tex}</math>`),
}

import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'

beforeEach(() => {
  prerenderState.shiki.mockReset()
  prerenderState.katex.mockReset()
  prerenderState.shiki.mockResolvedValue({ codeToHtml: (code: string) => `<pre><code>${code}</code></pre>` })
  prerenderState.katex.mockImplementation((tex: string) => `<math>${tex}</math>`)
})

describe('infra/pt/prerender — prerenderPortableTextBody', () => {
  it('returns the body unchanged when there are no code or math blocks', async () => {
    const body: PortableTextBody = [
      { _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'hi' }] },
    ]
    const result = await prerenderPortableTextBody(body)
    expect(result).toBe(body)
    expect(prerenderState.shiki).not.toHaveBeenCalled()
    expect(prerenderState.katex).not.toHaveBeenCalled()
  })

  it('skips code blocks with empty code or pre-highlighted html', async () => {
    const body: PortableTextBody = [
      { _type: 'code', _key: 'c1', code: '' },
      { _type: 'code', _key: 'c2', code: 'x', highlightedHtml: '<existing>' },
    ]
    const result = await prerenderPortableTextBody(body)
    expect(result).toBe(body)
  })

  it('skips math blocks with empty tex or pre-rendered mathml', async () => {
    const body: PortableTextBody = [
      { _type: 'mathBlock', _key: 'm1', tex: '' },
      { _type: 'mathBlock', _key: 'm2', tex: 'x', mathml: '<existing>' },
    ]
    const result = await prerenderPortableTextBody(body)
    expect(result).toBe(body)
  })

  it('highlights code blocks without pre-existing html', async () => {
    const body: PortableTextBody = [{ _type: 'code', _key: 'c1', code: 'const x = 1', language: 'typescript' }]
    await prerenderPortableTextBody(body)
    const block = body[0] as { highlightedHtml?: string }
    expect(block.highlightedHtml).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('renders mathml for math blocks', async () => {
    const body: PortableTextBody = [{ _type: 'mathBlock', _key: 'm1', tex: '\\sum_0^1' }]
    await prerenderPortableTextBody(body)
    const block = body[0] as { mathml?: string }
    expect(block.mathml).toBe('<math>\\sum_0^1</math>')
  })

  it('collects mathInline markDefs from text blocks', async () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: 'x' }],
        markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'E=mc^2' }],
      },
    ]
    await prerenderPortableTextBody(body)
    const def = (body[0] as { markDefs?: Array<{ _type: string; mathml?: string }> }).markDefs![0]
    expect(def.mathml).toBe('<math>E=mc^2</math>')
  })

  it('recurses into solution / footnoteDefinition blocks', async () => {
    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol1',
        children: [{ _type: 'code', _key: 'c1', code: 'nested' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'mathBlock', _key: 'm1', tex: 'x' }],
      },
    ]
    await prerenderPortableTextBody(body)
    expect((body[0] as { children: Array<{ highlightedHtml?: string }> }).children[0].highlightedHtml).toBeDefined()
    expect((body[1] as { children: Array<{ mathml?: string }> }).children[0].mathml).toBeDefined()
  })

  it('recurses into twoColumn left and right children', async () => {
    const body: PortableTextBody = [
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [{ _type: 'code', _key: 'c1', code: 'left' }],
        right: [{ _type: 'mathBlock', _key: 'm1', tex: 'right' }],
      },
    ]
    await prerenderPortableTextBody(body)
    const block = body[0] as { left: Array<{ highlightedHtml?: string }>; right: Array<{ mathml?: string }> }
    expect(block.left[0].highlightedHtml).toBeDefined()
    expect(block.right[0].mathml).toBeDefined()
  })

  it('is a no-op for table / horizontalRule / image / musicPlayer blocks', async () => {
    const body: PortableTextBody = [
      { _type: 'horizontalRule', _key: 'hr1' },
      { _type: 'image', _key: 'i1', src: 'https://example.com/x.png' },
      { _type: 'musicPlayer', _key: 'm1', playerId: 'p1' },
      { _type: 'table', _key: 't1', rows: [] },
    ]
    const result = await prerenderPortableTextBody(body)
    expect(result).toBe(body)
  })

  it('does not throw when shiki bootstrap rejects', async () => {
    prerenderState.shiki.mockRejectedValue(new Error('shiki fail'))
    const body: PortableTextBody = [{ _type: 'code', _key: 'c1', code: 'x' }]
    await expect(prerenderPortableTextBody(body)).resolves.toBe(body)
  })

  it('does not throw when an individual shiki codeToHtml call fails', async () => {
    prerenderState.shiki.mockResolvedValue({
      codeToHtml: () => {
        throw new Error('bad lang')
      },
    })
    const body: PortableTextBody = [{ _type: 'code', _key: 'c1', code: 'x' }]
    await expect(prerenderPortableTextBody(body)).resolves.toBe(body)
  })

  it('does not throw when a katex render call fails', async () => {
    prerenderState.katex.mockImplementation(() => {
      throw new Error('bad tex')
    })
    const body: PortableTextBody = [{ _type: 'mathBlock', _key: 'm1', tex: 'x' }]
    await expect(prerenderPortableTextBody(body)).resolves.toBe(body)
  })
})
