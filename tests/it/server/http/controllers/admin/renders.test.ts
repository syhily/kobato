import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/infra/pt/katex-renderer', () => ({
  getKatexRenderer: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/search-reindex', () => ({
  reindexSearchBatch: vi.fn(),
}))

const { getKatexRenderer } = await import('@/server/infra/pt/katex-renderer')
const { reindexSearchBatch } = await import('@/server/domains/posts/services/search-reindex')
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
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.math, { tex: '\\frac{1}{2}' }, { context: ctx })
    expect(res.mathml).toBe('<mathml>\\frac{1}{2}</mathml>')
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
    })
    const ctx = makeAuthedCtx()
    const res = await call(adminRendersRouter.reindexSearch, { offset: 0, batchSize: 10 }, { context: ctx })
    expect(res.processed).toBe(5)
    expect(res.total).toBe(100)
    expect(res.nextOffset).toBe(10)
  })
})
