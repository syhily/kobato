import type { LexicalEditor } from 'lexical'

import { $getSelection, $isRangeSelection } from 'lexical'

import { $createCodeCardNode, $createMathCardNode } from '@/ui/inkling/editor/cards/simple-card-nodes'

/** Seed content for a freshly inserted code block. */
const DEFAULT_CODE = "console.log('hello')"

/** Seed content for a freshly inserted math block. */
const DEFAULT_MATH_TEX = ['\\begin{align*}', '    a &= b\\\\', '    c &= d', '\\end{align*}'].join('\n')

/**
 * Insert a code-block card at the current selection. Falls back to inserting
 * after the first node of the current selection when the selection is not a
 * range (e.g. a block-level selection on a decorator node). No-op if there
 * is no selection at all.
 */
export function insertCommentCodeBlock(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection()
    if (selection === null) {
      return
    }
    const codeBlock = $createCodeCardNode({ code: DEFAULT_CODE })
    if ($isRangeSelection(selection)) {
      selection.insertNodes([codeBlock])
    } else {
      selection.getNodes()[0]?.insertAfter(codeBlock)
    }
  })
}

/**
 * Insert a math-block card at the current selection. Same fallback semantics
 * as {@link insertCommentCodeBlock}.
 */
export function insertCommentMathBlock(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection()
    if (selection === null) {
      return
    }
    const mathBlock = $createMathCardNode({ tex: DEFAULT_MATH_TEX })
    if ($isRangeSelection(selection)) {
      selection.insertNodes([mathBlock])
    } else {
      selection.getNodes()[0]?.insertAfter(mathBlock)
    }
  })
}
