import { describe, expect, it } from 'vitest'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { commentBodyPlainText } from '@/ui/public/comments/comment-body-helpers'

function text(textValue: string) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: textValue }
}

function paragraph(children: unknown[] = [text('hello')]) {
  return { type: 'paragraph', version: 1, children, direction: 'ltr', format: '', indent: 0 }
}

function commentState(children: unknown[]): CommentEditorState {
  return {
    root: { type: 'root', version: 1, children, direction: 'ltr', format: '', indent: 0 },
  } as CommentEditorState
}

describe('ui/public/comments/comment-body-helpers', () => {
  it('exports an empty editor-state constant that parses as a valid comment state', () => {
    expect(isCommentEditorStateBlank(EMPTY_COMMENT_EDITOR_STATE)).toBe(true)
  })

  describe('isCommentEditorStateBlank', () => {
    it('returns false for a paragraph with non-whitespace text', () => {
      expect(isCommentEditorStateBlank(commentState([paragraph()]))).toBe(false)
    })

    it('returns true for a paragraph with only whitespace text', () => {
      expect(isCommentEditorStateBlank(commentState([paragraph([text('  \t\n')])]))).toBe(true)
    })

    it('returns false for a non-empty code block', () => {
      expect(
        isCommentEditorStateBlank(
          commentState([
            { type: 'codeblock', version: 1, code: 'const x = 1', language: 'ts', caption: '', highlightedHtml: '' },
          ]),
        ),
      ).toBe(false)
    })

    it('returns true for a code block with only whitespace', () => {
      expect(
        isCommentEditorStateBlank(
          commentState([
            { type: 'codeblock', version: 1, code: '  \n', language: 'ts', caption: '', highlightedHtml: '' },
          ]),
        ),
      ).toBe(true)
    })

    it('returns false for a non-empty math block', () => {
      expect(
        isCommentEditorStateBlank(commentState([{ type: 'math', version: 1, tex: 'E = mc^2', mathml: '', svg: '' }])),
      ).toBe(false)
    })

    it('returns true for a math block with only whitespace', () => {
      expect(
        isCommentEditorStateBlank(commentState([{ type: 'math', version: 1, tex: ' ', mathml: '', svg: '' }])),
      ).toBe(true)
    })

    it('returns false when any node has content even if others are blank', () => {
      expect(
        isCommentEditorStateBlank(
          commentState([
            paragraph([text('   ')]),
            { type: 'codeblock', version: 1, code: 'x', language: '', caption: '', highlightedHtml: '' },
          ]),
        ),
      ).toBe(false)
    })
  })

  describe('commentBodyPlainText', () => {
    it('joins paragraph text across blocks', () => {
      expect(commentBodyPlainText(commentState([paragraph([text('first')]), paragraph([text('second')])]))).toBe(
        'first\nsecond',
      )
    })

    it('includes code block code and math tex (PT projection parity)', () => {
      expect(
        commentBodyPlainText(
          commentState([
            { type: 'codeblock', version: 1, code: 'const x = 1', language: 'ts', caption: '', highlightedHtml: '' },
            { type: 'math', version: 1, tex: 'a^2', mathml: '', svg: '' },
          ]),
        ),
      ).toBe('const x = 1\na^2')
    })

    it('routes legacy PT rows to the PT projection (interregnum)', () => {
      const ptBody = [
        {
          _type: 'block' as const,
          _key: 'b1',
          children: [{ _type: 'span' as const, _key: 's1', text: 'legacy', marks: [] }],
        },
      ]
      expect(commentBodyPlainText(ptBody)).toBe('legacy')
    })
  })
})
