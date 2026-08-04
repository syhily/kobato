import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical'

import { $applyNodeReplacement, ElementNode, isHTMLElement } from 'lexical'

// Footnote definition container node (PT `footnoteDefinition` block →
// `{type: 'footnoteDefinition', index, ptKey?, children}`). `ptKey` IS
// the definition key `footnoteRef` `targetKey` values point at (the PT
// `_key` contract). Children are non-container blocks only.
//
// Editor DOM is a plain `div[data-pt-footnote-definition]`; the public
// renderer collects definitions into the footnotes `<ol>` instead, so
// the export DOM is the definition row's content container, not the
// rendered list item. In-editor container interactions land in R3b.

export type SerializedFootnoteDefinitionNode = Spread<
  SerializedElementNode,
  {
    type: 'footnoteDefinition'
    /** Display index (1, 2, 3, …) — pre-computed at save time by `synchronizeFootnoteIndicesLexical`. */
    index: number
    /** Originating PT block `_key` — the `footnoteRef.targetKey` address. */
    ptKey?: string
  }
>

export class FootnoteDefinitionNode extends ElementNode {
  static getType(): string {
    return 'footnoteDefinition'
  }

  static clone(node: FootnoteDefinitionNode): FootnoteDefinitionNode {
    return new FootnoteDefinitionNode(node.__index, node.__ptKey, node.__key)
  }

  __index: number
  __ptKey: string | undefined

  constructor(index: number, ptKey?: string, key?: NodeKey) {
    super(key)
    this.__index = index
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedFootnoteDefinitionNode): FootnoteDefinitionNode {
    return $createFootnoteDefinitionNode(serializedNode.index, serializedNode.ptKey).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedFootnoteDefinitionNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedFootnoteDefinitionNode {
    return {
      ...super.exportJSON(),
      type: 'footnoteDefinition',
      index: this.__index,
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  getIndex(): number {
    return this.__index
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio (element: createDOM/updateDOM + import/export) ----------------

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-pt-footnote-definition', '')
    return element
  }

  updateDOM(_prevNode: FootnoteDefinitionNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.getAttribute('data-pt-footnote-definition') === null) {
          return null
        }
        const rawIndex = element.getAttribute('data-footnote-index')
        const parsed = rawIndex === null ? Number.NaN : Number.parseInt(rawIndex, 10)
        const index = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({ node: $createFootnoteDefinitionNode(index, ptKey) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(_editor)
    if (isHTMLElement(element)) {
      element.setAttribute('data-footnote-index', String(this.__index))
      if (this.__ptKey !== undefined) {
        element.setAttribute('data-pt-key', this.__ptKey)
      }
    }
    return { element }
  }
}

export function $createFootnoteDefinitionNode(index: number, ptKey?: string): FootnoteDefinitionNode {
  return $applyNodeReplacement(new FootnoteDefinitionNode(index, ptKey))
}

export function $isFootnoteDefinitionNode(node: LexicalNode | null | undefined): node is FootnoteDefinitionNode {
  return node instanceof FootnoteDefinitionNode
}
