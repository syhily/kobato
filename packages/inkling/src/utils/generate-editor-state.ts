import { $appendEmptyParagraph } from '@kobato/inkling-internal/utils/initial-document'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $insertNodes, $setSelection, type EditorState, type LexicalEditor, type LexicalNode } from 'lexical'

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
  if (initialHtml) {
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
    editor.update(
      () => {
        $appendEmptyParagraph()
      },
      { discrete: true, tag: 'history-merge' },
    )
  }

  return editor.getEditorState()
}
