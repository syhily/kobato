import { describe, expect, it } from 'vitest'

import { EMPTY_COMMENT_BODY, isCommentBodyBlank } from '@/ui/public/comments/comment-body-helpers'

describe('ui/public/comments/comment-body-helpers', () => {
  it('exports an empty body constant', () => {
    expect(EMPTY_COMMENT_BODY).toEqual([])
  })

  describe('isCommentBodyBlank', () => {
    it('returns true for an empty body', () => {
      expect(isCommentBodyBlank([])).toBe(true)
    })

    it('returns false for a text block with non-whitespace content', () => {
      const body = [
        {
          _type: 'block' as const,
          _key: 'b1',
          children: [{ _type: 'span' as const, _key: 's1', text: 'hello', marks: [] }],
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(false)
    })

    it('returns true for a text block with only whitespace', () => {
      const body = [
        {
          _type: 'block' as const,
          _key: 'b1',
          children: [{ _type: 'span' as const, _key: 's1', text: '   ', marks: [] }],
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(true)
    })

    it('returns true when every text span is whitespace', () => {
      const body = [
        {
          _type: 'block' as const,
          _key: 'b1',
          children: [
            { _type: 'span' as const, _key: 's1', text: '  ', marks: [] },
            { _type: 'span' as const, _key: 's2', text: '\t\n', marks: [] },
          ],
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(true)
    })

    it('returns false for a non-empty code block', () => {
      const body = [
        {
          _type: 'code' as const,
          _key: 'c1',
          code: 'const x = 1',
          language: 'ts',
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(false)
    })

    it('returns true for a code block with only whitespace', () => {
      const body = [
        {
          _type: 'code' as const,
          _key: 'c1',
          code: '   \n',
          language: 'ts',
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(true)
    })

    it('returns false for a non-empty math block', () => {
      const body = [
        {
          _type: 'mathBlock' as const,
          _key: 'm1',
          tex: 'E = mc^2',
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(false)
    })

    it('returns true for a math block with only whitespace', () => {
      const body = [
        {
          _type: 'mathBlock' as const,
          _key: 'm1',
          tex: '  ',
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(true)
    })

    it('returns false when any block has content even if others are blank', () => {
      const body = [
        {
          _type: 'block' as const,
          _key: 'b1',
          children: [{ _type: 'span' as const, _key: 's1', text: '   ', marks: [] }],
        },
        {
          _type: 'code' as const,
          _key: 'c1',
          code: 'x',
          language: 'ts',
        },
      ]
      expect(isCommentBodyBlank(body)).toBe(false)
    })
  })
})
