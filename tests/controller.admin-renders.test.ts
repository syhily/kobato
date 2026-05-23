import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/domains/pt/katex-renderer', () => ({
  getKatexRenderer: vi.fn(),
}))

vi.mock('beautiful-mermaid', () => ({
  renderMermaidSVGAsync: vi.fn(),
}))

vi.mock('@/server/domains/posts/reindex', () => ({
  reindexSearchBatch: vi.fn(),
}))

const { getKatexRenderer } = await import('@/server/domains/pt/katex-renderer')
const { renderMermaidSVGAsync } = await import('beautiful-mermaid')
const { reindexSearchBatch } = await import('@/server/domains/posts/reindex')
const { adminRendersRouter } = await import('@/server/http/controllers/admin/renders.controller')

describe('adminRendersRouter.math', () => {
  it('returns empty mathml for empty tex', async () => {
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.math, { tex: '' }, { context: ctx })
    expect(res.mathml).toBe('')
    expect(res.error).toBeNull()
  })

  it('returns rendered mathml for valid tex', async () => {
    vi.mocked(getKatexRenderer).mockResolvedValueOnce({
      render: vi.fn().mockResolvedValue('<mathml>\\frac{1}{2}</mathml>'),
    } as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.math, { tex: '\\frac{1}{2}' }, { context: ctx })
    expect(res.mathml).toBe('<mathml>\\frac{1}{2}</mathml>')
    expect(res.error).toBeNull()
  })
})

describe('adminRendersRouter.mermaid', () => {
  it('returns empty svg for empty code', async () => {
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.mermaid, { code: '' }, { context: ctx })
    expect(res.svg).toBe('')
    expect(res.error).toBeNull()
  })

  it('returns rendered svg for valid code', async () => {
    vi.mocked(renderMermaidSVGAsync).mockResolvedValueOnce('<svg>diagram</svg>' as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.mermaid, { code: 'graph TD; A-->B;' }, { context: ctx })
    expect(res.svg).toBe('<svg>diagram</svg>')
    expect(res.error).toBeNull()
  })
})

describe('adminRendersRouter.reindexSearch', () => {
  it('returns batch reindex stats', async () => {
    vi.mocked(reindexSearchBatch).mockResolvedValueOnce({
      processed: 5,
      failed: 0,
      total: 100,
      nextOffset: 10,
    } as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.reindexSearch, { offset: 0, batchSize: 10 }, { context: ctx })
    expect(res.processed).toBe(5)
    expect(res.total).toBe(100)
    expect(res.nextOffset).toBe(10)
  })
})
