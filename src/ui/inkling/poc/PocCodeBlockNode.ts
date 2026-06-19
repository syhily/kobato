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

export interface SerializedPocCodeBlockNode extends SerializedLexicalNode {
  type: 'code-block'
  version: number
  code: string
  language?: string
}

export class PocCodeBlockNode extends DecoratorNode<null> {
  __code: string
  __language: string

  static getType(): string {
    return 'code-block'
  }

  static clone(node: PocCodeBlockNode): PocCodeBlockNode {
    return new PocCodeBlockNode(node.__code, node.__language, node.__key)
  }

  constructor(code: string, language = '', key?: NodeKey) {
    super(key)
    this.__code = code
    this.__language = language
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    if (this.__language) {
      code.className = `language-${this.__language}`
    }
    code.textContent = this.__code
    pre.append(code)
    return pre
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

  exportJSON(): SerializedPocCodeBlockNode {
    return {
      ...super.exportJSON(),
      type: 'code-block',
      version: 1,
      code: this.__code,
      language: this.__language,
    }
  }

  static importJSON(serializedNode: SerializedPocCodeBlockNode): PocCodeBlockNode {
    return new PocCodeBlockNode(serializedNode.code, serializedNode.language)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      pre: (node: Node) => {
        if (!(node instanceof HTMLElement)) {
          return null
        }
        const code = node.querySelector('code')
        const text = code?.textContent ?? node.textContent ?? ''
        let language = ''
        const className = code?.getAttribute('class') ?? ''
        const langMatch = /language-(\w+)/.exec(className)
        if (langMatch) {
          language = langMatch[1]!
        }
        return {
          conversion: (): DOMConversionOutput => ({
            node: new PocCodeBlockNode(text, language),
          }),
          priority: 1,
        }
      },
      code: (node: Node) => {
        // Only convert bare <code> when it is not already inside a <pre>;
        // the <pre> handler above takes priority for code blocks.
        if (node instanceof HTMLElement && node.parentElement?.tagName !== 'PRE') {
          return null
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    if (this.__language) {
      code.className = `language-${this.__language}`
    }
    code.textContent = this.__code
    pre.append(code)
    return { element: pre }
  }
}

export function $createPocCodeBlockNode(code: string, language = ''): PocCodeBlockNode {
  return new PocCodeBlockNode(code, language)
}

export function $isPocCodeBlockNode(node: unknown): node is PocCodeBlockNode {
  return node instanceof PocCodeBlockNode
}
