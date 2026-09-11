import type { LexicalNode } from 'lexical'

export class AsideParser {
  NodeClass: { new (): LexicalNode }

  constructor(NodeClass: { new (): LexicalNode }) {
    this.NodeClass = NodeClass
  }

  get DOMConversionMap() {
    return {
      blockquote: () => ({
        conversion: (domNode: HTMLElement) => {
          // tagName is guaranteed by Lexical's nodeName dispatch ('blockquote' key)
          if (domNode.classList.contains('inkling-blockquote-alt')) {
            const node = new this.NodeClass()
            return { node }
          }

          return null
        },
        priority: 0 as const,
      }),
    }
  }
}
