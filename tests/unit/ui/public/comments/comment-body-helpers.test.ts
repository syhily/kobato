import { describe, expect, it } from 'vitest'

import { emptyInklingDocument, inklingFromPt, inklingParagraph } from '#/_helpers/inkling'
import { isInklingCommentBlank } from '@/ui/public/comments/comment-body-helpers'

describe('ui/public/comments/comment-body-helpers', () => {
  describe('isInklingCommentBlank', () => {
    it('returns true for an empty document', () => {
      expect(isInklingCommentBlank(emptyInklingDocument())).toBe(true)
    })

    it('returns false for a paragraph with non-whitespace content', () => {
      expect(isInklingCommentBlank(inklingParagraph('hello'))).toBe(false)
    })

    it('returns true for a paragraph with only whitespace', () => {
      expect(isInklingCommentBlank(inklingParagraph('   '))).toBe(true)
    })

    it('returns true when every text span is whitespace', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
            {
              _type: 'block' as const,
              _key: 'b1',
              children: [
                { _type: 'span' as const, _key: 's1', text: '  ', marks: [] },
                { _type: 'span' as const, _key: 's2', text: '\t\n', marks: [] },
              ],
            },
          ]),
        ),
      ).toBe(true)
    })

    it('returns false for a non-empty code block', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
            {
              _type: 'code' as const,
              _key: 'c1',
              code: 'const x = 1',
              language: 'ts',
            },
          ]),
        ),
      ).toBe(false)
    })

    it('returns true for a code block with only whitespace', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
            {
              _type: 'code' as const,
              _key: 'c1',
              code: '   \n',
              language: 'ts',
            },
          ]),
        ),
      ).toBe(true)
    })

    it('returns false for a non-empty math block', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
            {
              _type: 'mathBlock' as const,
              _key: 'm1',
              tex: 'E = mc^2',
            },
          ]),
        ),
      ).toBe(false)
    })

    it('returns true for a math block with only whitespace', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
            {
              _type: 'mathBlock' as const,
              _key: 'm1',
              tex: '  ',
            },
          ]),
        ),
      ).toBe(true)
    })

    it('returns false when any block has content even if others are blank', () => {
      expect(
        isInklingCommentBlank(
          inklingFromPt([
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
          ]),
        ),
      ).toBe(false)
    })
  })
})
