import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
} from 'lexical'

import { ElementNode } from 'lexical'

export interface SerializedFootnoteDefinitionNode extends SerializedElementNode {
  type: 'footnote-definition'
  version: number
  targetKey: string
  index: number
}

export class FootnoteDefinitionNode extends ElementNode {
  __targetKey: string
  __index: number

  static getType(): string {
    return 'footnote-definition'
  }

  static clone(node: FootnoteDefinitionNode): FootnoteDefinitionNode {
    return new FootnoteDefinitionNode(node.__targetKey, node.__index, node.__key)
  }

  constructor(targetKey: string, index: number, key?: NodeKey) {
    super(key)
    this.__targetKey = targetKey
    this.__index = index
  }

  getTargetKey(): string {
    return this.__targetKey
  }

  getIndex(): number {
    return this.__index
  }

  setIndex(index: number): void {
    const writable = this.getWritable()
    writable.__index = index
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('section')
    element.className = 'inkling-footnote-definition'
    element.setAttribute('data-target-key', this.__targetKey)
    element.setAttribute('data-index', String(this.__index))
    return element
  }

  updateDOM(prevNode: FootnoteDefinitionNode, element: HTMLElement): boolean {
    if (prevNode.__targetKey !== this.__targetKey) {
      element.setAttribute('data-target-key', this.__targetKey)
    }
    if (prevNode.__index !== this.__index) {
      element.setAttribute('data-index', String(this.__index))
    }
    return false
  }

  static importJSON(serializedNode: SerializedFootnoteDefinitionNode): FootnoteDefinitionNode {
    return new FootnoteDefinitionNode(serializedNode.targetKey, serializedNode.index).updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedFootnoteDefinitionNode {
    return {
      ...super.exportJSON(),
      type: 'footnote-definition',
      version: 1,
      targetKey: this.__targetKey,
      index: this.__index,
    }
  }

  isInline(): boolean {
    return false
  }

  canBeEmpty(): boolean {
    return true
  }

  canIndent(): boolean {
    return false
  }

  collapseAtStart(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('section')
    element.className = 'inkling-footnote-definition'
    element.setAttribute('data-target-key', this.__targetKey)
    element.setAttribute('data-index', String(this.__index))
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      section: (node: Node) => {
        if (node instanceof HTMLElement && node.classList.contains('inkling-footnote-definition')) {
          const targetKey = node.getAttribute('data-target-key') ?? ''
          const index = Number.parseInt(node.getAttribute('data-index') ?? '1', 10)
          if (targetKey.length > 0) {
            return {
              conversion: () => ({ node: new FootnoteDefinitionNode(targetKey, Number.isNaN(index) ? 1 : index) }),
              priority: 1,
            }
          }
        }
        return null
      },
    }
  }
}

export function $createFootnoteDefinitionNode(targetKey: string, index: number): FootnoteDefinitionNode {
  return new FootnoteDefinitionNode(targetKey, index)
}

export function $isFootnoteDefinitionNode(node: LexicalNode | null | undefined): node is FootnoteDefinitionNode {
  return node instanceof FootnoteDefinitionNode
}
