import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'

/**
 * Attach a caption editor holding one paragraph of text to a card node — the
 * 'exports caption as html' pins across the card node specs shared this block
 * verbatim. Call inside the owning editor's update, like the node mutation it
 * is.
 */
export function attachCaptionEditorWithText(node: { __captionEditor: LexicalEditor | null }, text = 'Hello caption') {
  const captionEditor = createHeadlessEditor({ nodes: [], onError: () => {} })
  captionEditor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const paragraph = root.append($createParagraphNode())
      paragraph.append($createTextNode(text))
    },
    { onUpdate: () => {} },
  )
  node.__captionEditor = captionEditor
}
