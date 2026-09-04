import { describe, expect, it } from 'vitest'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { makeCommentBody } from '#/_helpers/catalog'
import { canonicalizeCommentBody } from '@/server/domains/comments/services/canonicalize'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// One paragraph whose text is wrapped in a link node with the given URL.
function linkedCommentBody(url: string): CommentEditorState {
  return unsafeCast<CommentEditorState>({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [
            {
              type: 'link',
              version: 1,
              url,
              direction: 'ltr',
              format: '',
              indent: 0,
              children: [
                { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'click' },
              ],
            },
          ],
        },
      ],
    },
  })
}

describe('security / XSS payload — canonicalizeCommentBody', () => {
  it('escapes script-like plain text in the HTML projection', async () => {
    const result = await canonicalizeCommentBody(makeCommentBody('<script>alert(1)</script>'))
    expect(result.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.content).not.toContain('<script>')
  })

  it('rejects javascript: scheme in link url', async () => {
    await expect(canonicalizeCommentBody(linkedCommentBody("javascript:alert('xss')"))).rejects.toThrow()
  })

  it('accepts plain text containing onerror-like strings (inert text in the HTML projection)', async () => {
    const result = await canonicalizeCommentBody(makeCommentBody('![x](y" onerror=alert(1))'))
    expect(result.content).toBe('<p>![x](y" onerror=alert(1))</p>')
  })
})
