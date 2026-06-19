import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { DecoratorNode } from 'lexical'

export interface SerializedPocImageCardNode extends SerializedLexicalNode {
  type: 'image-card'
  version: number
  src: string
  alt?: string
}

export class PocImageCardNode extends DecoratorNode<null> {
  __src: string
  __alt: string

  static getType(): string {
    return 'image-card'
  }

  static clone(node: PocImageCardNode): PocImageCardNode {
    return new PocImageCardNode(node.__src, node.__alt, node.__key)
  }

  constructor(src: string, alt = '', key?: NodeKey) {
    super(key)
    this.__src = src
    this.__alt = alt
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const img = document.createElement('img')
    img.src = this.__src
    img.alt = this.__alt
    return img
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): null {
    return null
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedPocImageCardNode {
    return {
      ...super.exportJSON(),
      type: 'image-card',
      version: 1,
      src: this.__src,
      alt: this.__alt,
    }
  }

  static importJSON(serializedNode: SerializedPocImageCardNode): PocImageCardNode {
    return new PocImageCardNode(serializedNode.src, serializedNode.alt)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: (node: Node) => {
        if (node instanceof HTMLImageElement) {
          const src = node.getAttribute('src') ?? ''
          if (src.length > 0) {
            return {
              conversion: (): DOMConversionOutput => ({
                node: new PocImageCardNode(src, node.getAttribute('alt') ?? ''),
              }),
              priority: 1,
            }
          }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img')
    element.setAttribute('src', this.__src)
    element.setAttribute('alt', this.__alt)
    return { element }
  }
}

export function $createPocImageCardNode(src: string, alt = ''): PocImageCardNode {
  return new PocImageCardNode(src, alt)
}

export function $isPocImageCardNode(node: unknown): node is PocImageCardNode {
  return node instanceof PocImageCardNode
}
