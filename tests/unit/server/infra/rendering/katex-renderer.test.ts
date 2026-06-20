import { describe, expect, it } from 'vitest'

describe('server/pt/katex-renderer', () => {
  it('renders TeX through KaTeX MathML output', async () => {
    const { getKatexRenderer } = await import('@/server/infra/rendering/katex-renderer')
    const renderer = await getKatexRenderer()

    const mathml = await renderer.render('x = 1', false)

    expect(mathml).toContain('<math')
    expect(mathml).toContain('<mi>x</mi>')
  })

  it('rejects malformed TeX instead of serializing error markup', async () => {
    const { getKatexRenderer } = await import('@/server/infra/rendering/katex-renderer')
    const renderer = await getKatexRenderer()

    await expect(renderer.render('x_', false)).rejects.toThrow(/Expected group after/)
  })
})
