import type { SerializedQuoteNode } from '@lexical/rich-text'
import type { LexicalNode } from 'lexical'

import { QuoteNode } from '@lexical/rich-text'
import { $createLineBreakNode, $isParagraphNode, $setFormatFromDOM } from 'lexical'

export class ExtendedQuoteNode extends QuoteNode {
  static getType() {
    return 'extended-quote'
  }

  static clone(node: ExtendedQuoteNode) {
    return new ExtendedQuoteNode(node.__key)
  }

  static importDOM() {
    const importers = QuoteNode.importDOM?.()
    return {
      ...importers,
      blockquote: convertBlockquoteElement,
    }
  }

  static importJSON(serializedNode: SerializedQuoteNode) {
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
      $setFormatFromDOM(node, element)
      return {
        node,
        after: (childNodes: LexicalNode[]) => {
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
