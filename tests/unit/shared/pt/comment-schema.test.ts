import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { commentTextBlockSchema, isCommentBodyEmpty, safeValidateCommentBody } from '@/shared/pt/comment-schema'
import { textBlockSchema } from '@/shared/pt/schema'

// The legacy PT comment schema still types pre-R12 rows (rendered through the
// interregnum PT path until R13 and emailed via comment-to-html until R14).

const validBody: CommentBody = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hello' }] },
]

describe('commentTextBlockSchema', () => {
  it('inherits the canonical text-block field set', () => {
    expect(Object.keys(commentTextBlockSchema.shape).sort()).toEqual(Object.keys(textBlockSchema.shape).sort())
  })
})

describe('safeValidateCommentBody', () => {
  it('returns ok:true for a valid body', () => {
    const result = safeValidateCommentBody(validBody)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body).toEqual(validBody)
    }
  })

  it('returns ok:false with a ZodError for an invalid body', () => {
    const result = safeValidateCommentBody([{ _type: 'image', _key: 'i1', src: '/x.png' }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(z.ZodError)
    }
  })
})

describe('isCommentBodyEmpty', () => {
  it('returns true for an empty array', () => {
    expect(isCommentBodyEmpty([])).toBe(true)
  })

  it('returns true for whitespace-only spans', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: '   ' }] },
    ]
    expect(isCommentBodyEmpty(body)).toBe(true)
  })

  it('returns false for non-empty text', () => {
    const body: CommentBody = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] },
    ]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })

  it('returns false for non-empty code', () => {
    const body: CommentBody = [{ _type: 'code', _key: 'c1', code: 'const x = 1' }]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })

  it('returns false for non-empty math', () => {
    const body: CommentBody = [{ _type: 'mathBlock', _key: 'm1', tex: 'E=mc^2' }]
    expect(isCommentBodyEmpty(body)).toBe(false)
  })
})
