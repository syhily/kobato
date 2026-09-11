import { $insertGeneratedNodes } from '@lexical/clipboard'
import { $generateNodesFromDOM } from '@lexical/html'
import { $createParagraphNode, $getRoot, type LexicalEditor } from 'lexical'

/**
 * The one HTML-import surgery (round 3, C7): both import legs — the headless
 * `htmlToLexical` importer and `HtmlOutputPlugin`'s initial `html` prop —
 * run this. A scaffold paragraph gives `$insertGeneratedNodes` a legal
 * anchor, the full-root selection makes the insert replace whatever the root
 * held, and `@lexical/clipboard`'s normalization supersedes the old
 * hand-rolled empty-node filter (facebook/lexical#2807).
 */
export function $insertHtmlDocument(editor: LexicalEditor, doc: Document): void {
  // reset the root to a single scaffold paragraph so the insert's anchor is
  // deterministic — appended after existing content, $insertGeneratedNodes
  // would leave a leading empty paragraph behind on mounted editors
  const paragraph = $createParagraphNode()
  $getRoot().clear()
  $getRoot().append(paragraph)

  const nodes = $generateNodesFromDOM(editor, doc)

  // use @lexical/clipboard as it has additional logic for normalizing nodes
  const selection = $getRoot().select()
  $insertGeneratedNodes(editor, nodes, selection)

  // clean up the original empty paragraph
  paragraph.remove()
}
