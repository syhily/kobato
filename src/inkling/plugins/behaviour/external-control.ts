import type { LexicalEditor } from 'lexical'

import { $createParagraphNode, $getRoot, $isDecoratorNode, $isElementNode } from 'lexical'

import { $selectCard } from '@/inkling/plugins/behaviour/card-adjacency'

// External control — the headless host-facing control surgeries behind
// ExternalControlPlugin (which keeps only API assembly), so hosts can drive
// the editor without a React mount.

/**
 * Focuses the editor at a document end. Lexical does not automatically
 * select a decorator node, so when the end child is a card it goes through
 * $selectCard's 'always' focus repair (a node selection has no caret to
 * focus).
 */
export function focusEditorAt(
  editor: LexicalEditor,
  { position = 'bottom' }: { position?: 'top' | 'bottom' } = {},
): void {
  editor.focus(
    () => {
      /* focus only — the selection repair below owns the decorator-node dance */
    },
    { defaultSelection: position === 'top' ? 'rootStart' : undefined },
  )

  if (position === 'top') {
    editor.update(() => {
      const firstChild = $getRoot().getFirstChild()

      if ($isDecoratorNode(firstChild)) {
        $selectCard(editor, firstChild, { focus: 'always' })
      }
    })
    return
  }

  editor.update(() => {
    const lastChild = $getRoot().getLastChild()

    if ($isDecoratorNode(lastChild)) {
      $selectCard(editor, lastChild, { focus: 'always' })
    } else if ($isElementNode(lastChild)) {
      lastChild.select()
    }
  })
}

export function insertParagraphAt(
  editor: LexicalEditor,
  position: 'top' | 'bottom',
  { focus = true }: { focus?: boolean } = {},
): void {
  editor.update(() => {
    const paragraphNode = $createParagraphNode()

    if (position === 'top') {
      const firstChild = $getRoot().getFirstChild()
      if (firstChild) {
        firstChild.insertBefore(paragraphNode)
      } else {
        $getRoot().append(paragraphNode)
      }
    } else {
      $getRoot().append(paragraphNode)
    }

    if (focus) {
      paragraphNode.selectStart()
    }
  })
}

export function lastNodeIsDecorator(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const lastNode = $getRoot().getLastChild()
    return lastNode !== null && $isDecoratorNode(lastNode)
  })
}
