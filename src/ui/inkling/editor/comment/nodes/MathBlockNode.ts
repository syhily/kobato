import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { DecoratorNode } from 'lexical'

export interface SerializedMathBlockNode extends SerializedLexicalNode {
  type: 'math-block'
  version: number
  tex: string
  mathml?: string
}

export class MathBlockNode extends DecoratorNode<null> {
  __tex: string
  __mathml?: string

  static getType(): string {
    return 'math-block'
  }

  static clone(node: MathBlockNode): MathBlockNode {
    return new MathBlockNode(node.__tex, node.__mathml, node.__key)
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

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('pre')
    element.className = 'inkling-math-block'
    const code = document.createElement('code')
    code.textContent = `$$${this.__tex}$$`
    element.append(code)
    return element
  }

  updateDOM(prevNode: MathBlockNode, element: HTMLElement): boolean {
    if (prevNode.__tex !== this.__tex) {
      const code = element.querySelector('code')
      if (code !== null) {
        code.textContent = `$$${this.__tex}$$`
      }
    }
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): null {
    return null
  }

  isInline(): boolean {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return `$$${this.__tex}$$`
  }

  exportJSON(): SerializedMathBlockNode {
    return {
      ...super.exportJSON(),
      type: 'math-block',
      version: 1,
      tex: this.__tex,
      mathml: this.__mathml,
    }
  }

  static importJSON(serializedNode: SerializedMathBlockNode): MathBlockNode {
    return new MathBlockNode(serializedNode.tex, serializedNode.mathml)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      pre: (node: Node) => {
        if (node instanceof HTMLElement && node.classList.contains('inkling-math-block')) {
          const code = node.querySelector('code')
          const text = code?.textContent ?? node.textContent ?? ''
          return {
            conversion: () => ({
              node: new MathBlockNode(text.replace(/^\$\$|\$\$$/g, '')),
            }),
            priority: 1,
          }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('pre')
    element.className = 'inkling-math-block'
    const code = document.createElement('code')
    code.textContent = `$$${this.__tex}$$`
    element.append(code)
    return { element }
  }
}

export function $createMathBlockNode(tex: string, mathml?: string): MathBlockNode {
  return new MathBlockNode(tex, mathml)
}

export function $isMathBlockNode(node: unknown): node is MathBlockNode {
  return node instanceof MathBlockNode
}
