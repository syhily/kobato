import { describe, expect, it, vi } from 'vitest'

import { makeCommentBody } from '#/_helpers/catalog'

vi.mock('@/server/infra/pt/lexical-prerender', () => ({
  prerenderLexicalEditorState: vi.fn(async (state: unknown) => state),
}))

import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { MAX_COMMENT_LENGTH } from '@/server/domains/comments/services/policy'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'

// The pre-render length gate: a hostile state can carry megabytes of text
// under the global 10 MB body cap, so the plain-text walk must reject it
// before the jsdom prerender runs (the rendered-content gate downstream
// stays authoritative and runs after).
describe('comments/services/canonicalize — pre-render length gate', () => {
  it('rejects an over-length state before paying for the prerender', async () => {
    vi.mocked(prerenderLexicalEditorState).mockClear()

    await expect(canonicalizeCommentBody(makeCommentBody('a'.repeat(MAX_COMMENT_LENGTH + 1)))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      descriptor: { messageKey: 'comments.error.contentTooLong', params: { max: MAX_COMMENT_LENGTH } },
    })
    expect(prerenderLexicalEditorState).not.toHaveBeenCalled()
  })

  it('lets a body under the cap reach the prerender', async () => {
    vi.mocked(prerenderLexicalEditorState).mockClear()

    const result = await canonicalizeCommentBody(makeCommentBody('hello'))

    expect(prerenderLexicalEditorState).toHaveBeenCalledTimes(1)
    expect(result.content).toContain('hello')
  })
})
