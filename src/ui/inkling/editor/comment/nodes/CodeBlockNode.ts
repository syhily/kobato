import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { DecoratorNode } from 'lexical'

export interface SerializedCodeBlockNode extends SerializedLexicalNode {
  type: 'code-block'
  version: number
  code: string
  language?: string
  highlightedHtml?: string
}

export class CodeBlockNode extends DecoratorNode<null> {
  __code: string
  __language?: string
  __highlightedHtml?: string

  static getType(): string {
    return 'code-block'
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(node.__code, node.__language, node.__highlightedHtml, node.__key)
  }

  constructor(code: string, language?: string, highlightedHtml?: string, key?: NodeKey) {
    super(key)
    this.__code = code
    this.__language = language
    this.__highlightedHtml = highlightedHtml
  }

  getCode(): string {
    return this.__code
  }

  getLanguage(): string | undefined {
    return this.__language
  }

  getHighlightedHtml(): string | undefined {
    return this.__highlightedHtml
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('pre')
    element.className = 'inkling-code-block'
    if (this.__language !== undefined) {
      element.setAttribute('data-language', this.__language)
    }
    const code = document.createElement('code')
    code.textContent = this.__code
    element.append(code)
    return element
  }

  updateDOM(prevNode: CodeBlockNode, element: HTMLElement): boolean {
    if (prevNode.__language !== this.__language) {
      if (this.__language !== undefined) {
        element.setAttribute('data-language', this.__language)
      } else {
        element.removeAttribute('data-language')
      }
    }
    if (prevNode.__code !== this.__code) {
      const code = element.querySelector('code')
      if (code !== null) {
        code.textContent = this.__code
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
    return this.__code
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      ...super.exportJSON(),
      type: 'code-block',
      version: 1,
      code: this.__code,
      language: this.__language,
      highlightedHtml: this.__highlightedHtml,
    }
  }

  static importJSON(serializedNode: SerializedCodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(serializedNode.code, serializedNode.language, serializedNode.highlightedHtml)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      pre: (node: Node) => {
        if (node instanceof HTMLElement && node.classList.contains('inkling-code-block')) {
          const code = node.querySelector('code')
          return {
            conversion: () => ({
              node: new CodeBlockNode(
                code?.textContent ?? node.textContent ?? '',
                node.getAttribute('data-language') ?? undefined,
              ),
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
    element.className = 'inkling-code-block'
    if (this.__language !== undefined) {
      element.setAttribute('data-language', this.__language)
    }
    const code = document.createElement('code')
    code.textContent = this.__code
    element.append(code)
    return { element }
  }
}

export function $createCodeBlockNode(code: string, language?: string, highlightedHtml?: string): CodeBlockNode {
  return new CodeBlockNode(code, language, highlightedHtml)
}

export function $isCodeBlockNode(node: unknown): node is CodeBlockNode {
  return node instanceof CodeBlockNode
}
