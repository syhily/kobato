import { $insertGeneratedNodes } from '@lexical/clipboard'
import { $generateNodesFromDOM } from '@lexical/html'
import { $createParagraphNode, $getRoot, type LexicalEditor } from 'lexical'

export function $insertHtmlDocument(editor: LexicalEditor, doc: Document): void {
  const paragraph = $createParagraphNode()
  $getRoot().clear()
  $getRoot().append(paragraph)

  const nodes = $generateNodesFromDOM(editor, doc)

  const selection = $getRoot().select()
  $insertGeneratedNodes(editor, nodes, selection)

  paragraph.remove()
}
