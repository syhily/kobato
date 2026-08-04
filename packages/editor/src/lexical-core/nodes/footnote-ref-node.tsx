import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { ReactNode } from 'react'

import { FootnoteRefView } from '@kobato/editor/lexical-core/nodes/views/footnote-ref-view'
import { FOOTNOTE_REF_CLASS } from '@kobato/editor/lexical-html/manifest'
import { footnoteAnchorHref, footnoteRefId } from '@kobato/shared/lexical/footnote-anchors'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Footnote reference node (PT `footnoteRef` mark → `{type: 'footnoteRef',
// targetKey, index, ptKey?}`). `targetKey` points at the `ptKey` of the
// `footnoteDefinition` node — the same `_key` the PT track uses.
// Serialization is the R1 contract; this round adds the DOM trio — the
// `<sup data-footnote-ref>` manifest form, round-trippable via the
// `data-*` attributes. Click-to-edit (the footnote loop) lands in R3b;
// the decorate view is static.

export type SerializedFootnoteRefNode = Spread<
  SerializedLexicalNode,
  {
    type: 'footnoteRef'
    targetKey: string
    /** Display index (1, 2, 3, …) — pre-computed at save time by `synchronizeFootnoteIndicesLexical`. */
    index: number
    /** Originating PT markDef `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class FootnoteRefNode extends DecoratorNode<ReactNode> {
  static getType(): string {
    return 'footnoteRef'
  }

  static clone(node: FootnoteRefNode): FootnoteRefNode {
    return new FootnoteRefNode(node.__targetKey, node.__index, node.__ptKey, node.__key)
  }

  __targetKey: string
  __index: number
  __ptKey: string | undefined

  constructor(targetKey: string, index: number, ptKey?: string, key?: NodeKey) {
    super(key)
    this.__targetKey = targetKey
    this.__index = index
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedFootnoteRefNode): FootnoteRefNode {
    return new FootnoteRefNode(serializedNode.targetKey, serializedNode.index, serializedNode.ptKey)
  }

  exportJSON(): SerializedFootnoteRefNode {
    return {
      type: 'footnoteRef',
      version: 1,
      targetKey: this.__targetKey,
      index: this.__index,
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  isInline(): boolean {
    return true
  }

  // --- mutation helpers (editor views) ---------------------------------------

  setTargetKey(targetKey: string): void {
    this.getWritable().__targetKey = targetKey
  }

  setIndex(index: number): void {
    this.getWritable().__index = index
  }

  getTargetKey(): string {
    return this.__targetKey
  }

  getIndex(): number {
    return this.__index
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio ---------------------------------------------------------------
  //
  // `createDOM` returns the in-editor `<sup>` container (the React view
  // is portaled into it); the export form is built separately in
  // `exportDOM` with the full anchor markup.

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('sup')
    element.setAttribute('data-footnote-ref', '')
    return element
  }

  updateDOM(_prevNode: FootnoteRefNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  decorate(editor: LexicalEditor): ReactNode {
    return <FootnoteRefView node={this} editor={editor} />
  }

  static importDOM(): DOMConversionMap | null {
    return {
      sup: (element: HTMLElement) => {
        // Both the editor's own export (`sup[data-footnote-ref]`) and the
        // historical tiptap form (`sup[data-footnote-ref]`) parse.
        if (element.getAttribute('data-footnote-ref') === null) {
          return null
        }
        const targetKey = element.getAttribute('data-footnote-target-key') ?? ''
        const rawIndex = element.getAttribute('data-footnote-index')
        const parsed = rawIndex === null ? Number.NaN : Number.parseInt(rawIndex, 10)
        const index = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({ node: $createFootnoteRefNode(targetKey, index, ptKey) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement('sup')
    element.id = footnoteRefId(this.__index)
    element.setAttribute('data-footnote-ref', '')
    element.setAttribute('data-footnote-target-key', this.__targetKey)
    element.setAttribute('data-footnote-index', String(this.__index))
    if (this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    const anchor = document.createElement('a')
    anchor.href = footnoteAnchorHref(this.__index)
    anchor.className = FOOTNOTE_REF_CLASS
    anchor.textContent = String(this.__index)
    element.append(anchor)
    return { element }
  }
}

export function $createFootnoteRefNode(targetKey: string, index: number, ptKey?: string): FootnoteRefNode {
  return $applyNodeReplacement(new FootnoteRefNode(targetKey, index, ptKey))
}

export function $isFootnoteRefNode(node: LexicalNode | null | undefined): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode
}
