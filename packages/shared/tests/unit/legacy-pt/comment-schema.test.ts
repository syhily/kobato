import type { CommentBody } from '@kobato/shared/legacy-pt/comment-schema'

import {
  commentTextBlockSchema,
  isCommentBodyEmpty,
  safeValidateCommentBody,
  validateCommentBody,
} from '@kobato/shared/legacy-pt/comment-schema'
import { textBlockSchema } from '@kobato/shared/legacy-pt/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// The PT comment dialect gate: strict PortableText subset accepted in
// comment bodies. The markdown-projection tests retired with the PT
// comment-markdown module (R6) — the current markdown pipeline is the
// Lexical one (`@kobato/editor/lexical-core/comment-markdown`).

const validBody: CommentBody = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hello' }] },
]

describe('validateCommentBody', () => {
  it('inherits the canonical text-block field set', () => {
    expect(Object.keys(commentTextBlockSchema.shape).sort()).toEqual(Object.keys(textBlockSchema.shape).sort())
  })

  it('returns a valid comment body', () => {
    expect(validateCommentBody(validBody)).toEqual(validBody)
  })

  it('throws for a body with a disallowed block style', () => {
    const bad = [{ _type: 'block', _key: 'b1', style: 'h2', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] }]
    expect(() => validateCommentBody(bad)).toThrow()
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
