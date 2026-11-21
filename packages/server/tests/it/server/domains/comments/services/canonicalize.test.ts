import { makeCommentBody } from '@kobato/api/tests/utils/catalog'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/infra/lexical/lexical-prerender', () => ({
  prerenderLexicalEditorState: vi.fn(async (state: unknown) => state),
}))

import { canonicalizeCommentBody } from '@kobato/server/domains/comments/services/canonicalize'
import { MAX_COMMENT_LENGTH } from '@kobato/server/domains/comments/services/policy'
import { prerenderLexicalEditorState } from '@kobato/server/infra/lexical/lexical-prerender'

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
