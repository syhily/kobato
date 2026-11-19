import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'

export function attachCaptionEditorWithText(node: { __captionEditor: LexicalEditor | null }, text = 'Hello caption') {
  const captionEditor = createHeadlessEditor({ nodes: [], onError: () => {} })
  captionEditor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode(text))
      root.append(paragraph)
    },
    { discrete: true },
  )
  node.__captionEditor = captionEditor
}
