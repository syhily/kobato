import type { SerializedQuoteNode } from '@lexical/rich-text'
import type { LexicalNode } from 'lexical'

import { QuoteNode } from '@lexical/rich-text'
import { $createLineBreakNode, $isParagraphNode, $setFormatFromDOM } from 'lexical'

// QuoteNode is foundational to Lexical rich-text, so replacing it outright
// would force every package to work with a custom node. Extend the default
// with custom parsing via Lexical's node override/replacement mechanism.
//
// https://lexical.dev/docs/concepts/serialization#handling-extended-html-styling

export class ExtendedQuoteNode extends QuoteNode {
  static getType() {
    return 'extended-quote'
  }

  static clone(node: ExtendedQuoteNode) {
    return new ExtendedQuoteNode(node.__key)
  }

  static importDOM() {
    // Optional since the $config() protocol port (see ExtendedHeadingNode).
    const importers = QuoteNode.importDOM?.()
    return {
      ...importers,
      blockquote: convertBlockquoteElement,
    }
  }

  static importJSON(serializedNode: SerializedQuoteNode) {
    // delegating to QuoteNode.importJSON builds a genuine QuoteNode in any
    // editor where the replacement registration is absent
    return new ExtendedQuoteNode().updateFromJSON(serializedNode)
  }

  exportJSON() {
    const json = super.exportJSON()
    json.type = 'extended-quote'
    return json
  }

  /* c8 ignore start */
  extractWithChild() {
    return true
  }
  /* c8 ignore end */
}

export const extendedQuoteNodeReplacement = {
  replace: QuoteNode,
  with: () => new ExtendedQuoteNode(),
  withKlass: ExtendedQuoteNode,
}

function convertBlockquoteElement() {
  return {
    conversion: (element: HTMLElement) => {
      const node = new ExtendedQuoteNode()
      // upstream's $convertBlockquoteElement reads style.textAlign; the
      // override shadowed it, so imported quote alignment would drop even
      // when the importer keeps `format`
      $setFormatFromDOM(node, element)
      return {
        node,
        after: (childNodes: LexicalNode[]) => {
          // Blockquotes can have nested paragraphs. Collapse each nested
          // paragraph into the single blockquote, separated by two line
          // breaks — the established conversion behaviour.
          const newChildNodes: LexicalNode[] = []

          childNodes.forEach((child: LexicalNode) => {
            if ($isParagraphNode(child)) {
              if (newChildNodes.length > 0) {
                newChildNodes.push($createLineBreakNode())
                newChildNodes.push($createLineBreakNode())
              }

              newChildNodes.push(...child.getChildren())
            } else {
              newChildNodes.push(child)
            }
          })

          return newChildNodes
        },
      }
    },
    priority: 1 as const,
  }
}
