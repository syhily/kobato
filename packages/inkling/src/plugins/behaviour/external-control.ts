import type { LexicalEditor } from 'lexical'

import { $createParagraphNode, $getRoot, $isDecoratorNode, $isElementNode } from 'lexical'

import { $selectCard } from '@/plugins/behaviour/card-adjacency'

// External control — the headless host-facing control surgeries behind
// ExternalControlPlugin: focusing the editor at a document end (with the
// decorator-node selection dance Lexical does not do itself), inserting a
// paragraph at either document end, and the last-node-is-decorator read.
// The plugin keeps only API assembly; hosts driving the editor headlessly
// (tests, server-side flows) can call these without a React mount.

/**
 * Focuses the editor at a document end. Lexical does not automatically
 * select a decorator node, so when the end child is a card it goes through
 * $selectCard's 'always' focus repair (a node selection has no caret to
 * focus); otherwise the end child selects itself (bottom) or Lexical's
 * rootStart default applies (top).
 */
export function focusEditorAt(
  editor: LexicalEditor,
  { position = 'bottom' }: { position?: 'top' | 'bottom' } = {},
): void {
  editor.focus(() => {}, { defaultSelection: position === 'top' ? 'rootStart' : undefined })

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

/**
 * Inserts a paragraph at a document end, optionally selecting its start.
 */
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

/**
 * Whether the document's last top-level node is a decorator (a card).
 */
export function lastNodeIsDecorator(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const lastNode = $getRoot().getLastChild()
    return lastNode !== null && $isDecoratorNode(lastNode)
  })
}
