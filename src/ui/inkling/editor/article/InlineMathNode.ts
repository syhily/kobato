import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { DecoratorNode } from 'lexical'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface SerializedInlineMathNode extends SerializedLexicalNode {
  type: 'inline-math'
  version: number
  tex: string
  mathml?: string
}

export class InlineMathNode extends DecoratorNode<null> {
  __tex: string
  __mathml?: string

  static getType(): string {
    return 'inline-math'
  }

  static clone(node: InlineMathNode): InlineMathNode {
    return new InlineMathNode(node.__tex, node.__mathml, node.__key)
  }

  constructor(tex: string, mathml?: string, key?: NodeKey) {
    super(key)
    this.__tex = tex
    this.__mathml = mathml
  }

  getTex(): string {
    return this.__tex
  }

  getMathml(): string | undefined {
    return this.__mathml
  }

  setTex(tex: string): void {
    const writable = this.getWritable()
    writable.__tex = tex
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span')
    element.className = 'inkling-inline-math'
    element.textContent = `$${this.__tex}$`
    return element
  }

  updateDOM(prevNode: InlineMathNode, element: HTMLElement): boolean {
    if (prevNode.__tex !== this.__tex) {
      element.textContent = `$${this.__tex}$`
    }
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): null {
    return null
  }

  isInline(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return `$${this.__tex}$`
  }

  exportJSON(): SerializedInlineMathNode {
    // The serialized shape is spelled out explicitly instead of spreading
    // `super.exportJSON()` — the shape IS the frozen Inkling storage schema,
    // so it must not silently absorb new base fields. `type`/`version` were
    // always overridden explicitly. This is the frozen storage contract.
    return {
      type: 'inline-math',
      version: 1,
      tex: this.__tex,
      mathml: this.__mathml,
    }
  }

  static importJSON(serialized: SerializedLexicalNode): InlineMathNode {
    // Lexical 0.46 requires the base static signature; the payload is
    // structurally the Inkling node shape (see lexical-bridge.ts).
    const serializedNode = unsafeCast<SerializedInlineMathNode>(serialized)
    return new InlineMathNode(serializedNode.tex, serializedNode.mathml)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: Node) => {
        if (node instanceof HTMLElement && node.classList.contains('inkling-inline-math')) {
          const tex = node.getAttribute('data-tex') ?? node.textContent ?? ''
          if (tex.length > 0) {
            return {
              conversion: () => ({ node: new InlineMathNode(tex) }),
              priority: 1,
            }
          }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.className = 'inkling-inline-math'
    element.setAttribute('data-tex', this.__tex)
    element.textContent = `$${this.__tex}$`
    return { element }
  }
}

export function $createInlineMathNode(tex: string, mathml?: string): InlineMathNode {
  return new InlineMathNode(tex, mathml)
}

export function $isInlineMathNode(node: unknown): node is InlineMathNode {
  return node instanceof InlineMathNode
}
