import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $insertNodes, $setSelection, type EditorState, type LexicalEditor, type LexicalNode } from 'lexical'

import { $appendEmptyParagraph } from '@/inkling/utils/initial-document'

// exported for testing
export function _$generateNodesFromHTML(editor: LexicalEditor, html: string): LexicalNode[] {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  const nodes = $generateNodesFromDOM(editor, dom)
  return nodes
}

export default function generateEditorState({
  editor,
  initialHtml,
}: {
  editor: LexicalEditor
  initialHtml?: string
}): EditorState {
  // Both branches tag the update `history-merge` so undo cannot clear the seeded state.
  if (initialHtml) {
    // No registerDefaultTransforms on this long-lived editor on purpose; see the
    // transform-policy note in initial-document.ts.
    editor.update(
      () => {
        const nodes = _$generateNodesFromHTML(editor, initialHtml)

        $getRoot().select()
        $getRoot().clear()

        $insertNodes(nodes)

        // $insertNodes focuses the editor (https://github.com/facebook/lexical/issues/4546),
        // breaking autofocus when initial filling happens after mount; components manage focus instead.
        if (nodes.length) {
          $setSelection(null)
        }
      },
      { discrete: true, tag: 'history-merge' },
    )
  } else {
    // An empty initial value still needs a paragraph: a completely empty root won't accept focus.
    editor.update(
      () => {
        $appendEmptyParagraph()
      },
      { discrete: true, tag: 'history-merge' },
    )
  }

  return editor.getEditorState()
}
