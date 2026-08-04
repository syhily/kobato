import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalBody, LexicalParagraphNode } from '@kobato/shared/lexical/schema'

// Shared test fixture builders for Lexical bodies — the minimal canonical
// shapes tests need (the R5b successors of the PT `block()`/`[]` fixtures).

const ELEMENT_BASE = { direction: null, format: '', indent: 0, version: 1 } as const

/** A text node with plain formatting. */
export function lexTextNode(text: string) {
  return { detail: 0, format: 0, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 as const }
}

/** A paragraph block with one plain text child. */
export function lexParagraphNode(text: string): LexicalParagraphNode {
  return {
    ...ELEMENT_BASE,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: [lexTextNode(text)],
  }
}

/** A full body wrapping the given blocks (empty array = empty body). */
export function lexBody(blocks: LexicalBody['root']['children'] = []): LexicalBody {
  return { root: { ...ELEMENT_BASE, type: 'root', children: blocks } }
}

/** A one-paragraph body — the most common single-fixture shape. */
export function lexParagraphBody(text: string): LexicalBody {
  return lexBody([lexParagraphNode(text)])
}

/** A comment-dialect body with one paragraph. */
export function lexCommentBody(text: string): LexicalCommentBody {
  return {
    root: {
      ...ELEMENT_BASE,
      type: 'root',
      children: [
        {
          ...ELEMENT_BASE,
          type: 'paragraph',
          textFormat: 0,
          textStyle: '',
          children: [lexTextNode(text)],
        },
      ],
    },
  }
}
