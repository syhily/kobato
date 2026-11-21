import type { LexicalEditor } from 'lexical'

import { $selectCard } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { $createParagraphNode, $getRoot, $isDecoratorNode, $isElementNode } from 'lexical'

export function focusEditorAt(
  editor: LexicalEditor,
  { position = 'bottom' }: { position?: 'top' | 'bottom' } = {},
): void {
  editor.focus(() => undefined, { defaultSelection: position === 'top' ? 'rootStart' : undefined })

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
