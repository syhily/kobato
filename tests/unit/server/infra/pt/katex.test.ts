import katex from 'katex'
import { describe, expect, it } from 'vitest'

import { KATEX_OPTIONS } from '@/server/infra/pt/katex'

describe('infra/pt/katex — KATEX_OPTIONS', () => {
  it('renders TeX through KaTeX MathML output', () => {
    const mathml = katex.renderToString('x = 1', { ...KATEX_OPTIONS, displayMode: false })

    expect(mathml).toContain('<math')
    expect(mathml).toContain('<mi>x</mi>')
  })

  it('rejects malformed TeX instead of serializing error markup', () => {
    expect(() => katex.renderToString('x_', { ...KATEX_OPTIONS, displayMode: false })).toThrow(/Expected group after/)
  })
})
