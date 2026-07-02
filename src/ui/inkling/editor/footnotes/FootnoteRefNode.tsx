import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'
import type { JSX } from 'react'

import { DecoratorNode } from 'lexical'

import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { FootnoteRefComponent } from '@/ui/inkling/editor/footnotes/FootnoteRefComponent'

export interface SerializedFootnoteRefNode extends SerializedLexicalNode {
  type: 'footnote-ref'
  version: number
  targetKey: string
  refKey: string
  index: number
}

export class FootnoteRefNode extends DecoratorNode<JSX.Element | null> {
  __targetKey: string
  __refKey: string
  __index: number

  static getType(): string {
    return 'footnote-ref'
  }

  static clone(node: FootnoteRefNode): FootnoteRefNode {
    return new FootnoteRefNode(node.__targetKey, node.__refKey, node.__index, node.__key)
  }

  constructor(targetKey: string, refKey: string, index: number, key?: NodeKey) {
    super(key)
    this.__targetKey = targetKey
    this.__refKey = refKey
    this.__index = index
  }

  getTargetKey(): string {
    return this.__targetKey
  }

  getRefKey(): string {
    return this.__refKey
  }

  getIndex(): number {
    return this.__index
  }

  setIndex(index: number): void {
    const writable = this.getWritable()
    writable.__index = index
  }

  createDOM(_config: EditorConfig): HTMLElement {
    // The React decorator component renders the <sup>, so the host element is
    // a neutral span to avoid nested <sup> elements.
    const element = document.createElement('span')
    element.className = 'inkling-footnote-ref-host'
    return element
  }

  updateDOM(prevNode: FootnoteRefNode, element: HTMLElement): boolean {
    // The React decorator component owns the visible <sup>; only sync host
    // attributes here so exportDOM/importDOM round-trips stay consistent.
    if (prevNode.__targetKey !== this.__targetKey) {
      element.setAttribute('data-target-key', this.__targetKey)
    }
    if (prevNode.__refKey !== this.__refKey) {
      element.setAttribute('data-ref-key', this.__refKey)
    }
    if (prevNode.__index !== this.__index) {
      element.setAttribute('data-index', String(this.__index))
    }
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <FootnoteRefComponent node={this} />
  }

  isInline(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return String(this.__index)
  }

  exportJSON(): SerializedFootnoteRefNode {
    // The serialized shape is spelled out explicitly instead of spreading
    // `super.exportJSON()` — the shape IS the frozen Inkling storage schema,
    // so it must not silently absorb new base fields. `type`/`version` were
    // always overridden explicitly. This is the frozen storage contract.
    return {
      type: 'footnote-ref',
      version: 1,
      targetKey: this.__targetKey,
      refKey: this.__refKey,
      index: this.__index,
    }
  }

  static importJSON(serialized: SerializedLexicalNode): FootnoteRefNode {
    // Lexical 0.46 requires the base static signature; the payload is
    // structurally the Inkling node shape (see lexical-bridge.ts).
    const serializedNode = unsafeCast<SerializedFootnoteRefNode>(serialized)
    return new FootnoteRefNode(serializedNode.targetKey, serializedNode.refKey, serializedNode.index)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      sup: (node: Node) => {
        if (!(node instanceof HTMLElement)) {
          return null
        }
        const isInkling = node.classList.contains('inkling-footnote-ref')
        const isLegacyTiptap = node.hasAttribute('data-footnote-ref')
        if (!isInkling && !isLegacyTiptap) {
          return null
        }

        const targetKey =
          node.getAttribute('data-target-key') ?? node.getAttribute('data-footnote-ref') ?? 'legacy-target'
        const refKey = node.getAttribute('data-ref-key') ?? 'legacy-ref'
        const dataIndex = node.getAttribute('data-index')
        const textIndex = Number.parseInt(node.textContent ?? '', 10)
        // Resolve the 1-based index: prefer the explicit `data-index` attribute,
        // fall back to the text content (legacy), default to 1. Both parses are
        // NaN-checked before use so no non-null assertion is needed.
        const parsedDataIndex = dataIndex !== null ? Number.parseInt(dataIndex, 10) : Number.NaN
        const index = !Number.isNaN(parsedDataIndex) ? parsedDataIndex : !Number.isNaN(textIndex) ? textIndex : 1

        return {
          conversion: () => ({ node: new FootnoteRefNode(targetKey, refKey, index) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('sup')
    element.className = 'inkling-footnote-ref'
    element.setAttribute('data-target-key', this.__targetKey)
    element.setAttribute('data-ref-key', this.__refKey)
    element.setAttribute('data-index', String(this.__index))
    element.textContent = String(this.__index)
    return { element }
  }
}

export function $createFootnoteRefNode(targetKey: string, refKey: string, index: number): FootnoteRefNode {
  return new FootnoteRefNode(targetKey, refKey, index)
}

export function $isFootnoteRefNode(node: unknown): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode
}
