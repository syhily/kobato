import { $insertGeneratedNodes } from '@lexical/clipboard'
import { $generateNodesFromDOM } from '@lexical/html'
import { $createParagraphNode, $getRoot, type LexicalEditor } from 'lexical'

/**
 * The one HTML-import surgery both legs run — the headless `htmlToLexical`
 * importer and `HtmlOutputPlugin`'s initial `html` prop. A scaffold paragraph
 * gives `$insertGeneratedNodes` a legal anchor, the full-root selection makes
 * the insert replace whatever the root held, and `@lexical/clipboard`'s
 * normalization provides the empty-node filtering (facebook/lexical#2807).
 */
export function $insertHtmlDocument(editor: LexicalEditor, doc: Document): void {
  // reset the root to a single scaffold paragraph so the insert's anchor is
  // deterministic — appended after existing content, $insertGeneratedNodes
  // would leave a leading empty paragraph behind on mounted editors
  const paragraph = $createParagraphNode()
  $getRoot().clear()
  $getRoot().append(paragraph)

  const nodes = $generateNodesFromDOM(editor, doc)

  const selection = $getRoot().select()
  $insertGeneratedNodes(editor, nodes, selection)

  paragraph.remove()
}
