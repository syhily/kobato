import type { DOMConversionMap, DOMExportOutput, NodeKey, SerializedLexicalNode } from 'lexical'

import { DecoratorNode } from 'lexical'

export interface SerializedPocCardNode extends SerializedLexicalNode {}

export class PocCardNode extends DecoratorNode<null> {
  static getType(): string {
    return 'poc-card'
  }

  static clone(node: PocCardNode): PocCardNode {
    return new PocCardNode(node.__key)
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  createDOM(): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(): false {
    return false
  }

  decorate(): null {
    return null
  }

  exportJSON(): SerializedPocCardNode {
    return {
      ...super.exportJSON(),
      type: 'poc-card',
      version: 1,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-poc-card', 'true')
    return { element }
  }

  static importJSON(): PocCardNode {
    return new PocCardNode()
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingPocCard === 'true') {
          return {
            conversion: () => ({ node: new PocCardNode() }),
            priority: 1,
          }
        }
        return null
      },
    }
  }
}

export function $createPocCardNode(): PocCardNode {
  return new PocCardNode()
}
