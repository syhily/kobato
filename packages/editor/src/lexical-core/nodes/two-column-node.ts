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

import { TWO_COLUMN_CLASS, TWO_COLUMN_PANE_CLASS } from '@kobato/editor/lexical-html/manifest'
import { $applyNodeReplacement, ElementNode, isHTMLElement } from 'lexical'

// Two-column container nodes (PT `twoColumn` block → `{type: 'twoColumn',
// ptKey?, children: [pane, pane]}` with one `twoColumnPane` per side,
// left first). Children of the panes are non-container blocks only.
// Editor DOM mirrors the render contract (`section[data-pt-two-column]`
// with two `div[data-pt-two-column-pane][data-side]` panes). In-editor
// pane interactions (add/remove panes, drag) land in R3b — this round is
// structure only.

export type SerializedTwoColumnPaneNode = Spread<
  SerializedElementNode,
  {
    type: 'twoColumnPane'
    side: 'left' | 'right'
  }
>

export class TwoColumnPaneNode extends ElementNode {
  static getType(): string {
    return 'twoColumnPane'
  }

  static clone(node: TwoColumnPaneNode): TwoColumnPaneNode {
    return new TwoColumnPaneNode(node.__side, node.__key)
  }

  __side: 'left' | 'right'

  constructor(side: 'left' | 'right', key?: NodeKey) {
    super(key)
    this.__side = side
  }

  static importJSON(serializedNode: SerializedTwoColumnPaneNode): TwoColumnPaneNode {
    return $createTwoColumnPaneNode(serializedNode.side).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTwoColumnPaneNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedTwoColumnPaneNode {
    return {
      ...super.exportJSON(),
      type: 'twoColumnPane',
      side: this.__side,
    }
  }

  // --- DOM trio (element: createDOM/updateDOM + import/export) ----------------

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-pt-two-column-pane', '')
    element.setAttribute('data-side', this.__side)
    element.className = TWO_COLUMN_PANE_CLASS
    return element
  }

  updateDOM(_prevNode: TwoColumnPaneNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        const side = element.getAttribute('data-side')
        if (element.getAttribute('data-pt-two-column-pane') === null || (side !== 'left' && side !== 'right')) {
          return null
        }
        return {
          conversion: () => ({ node: $createTwoColumnPaneNode(side) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    return super.exportDOM(_editor)
  }
}

export function $createTwoColumnPaneNode(side: 'left' | 'right'): TwoColumnPaneNode {
  return $applyNodeReplacement(new TwoColumnPaneNode(side))
}

export function $isTwoColumnPaneNode(node: LexicalNode | null | undefined): node is TwoColumnPaneNode {
  return node instanceof TwoColumnPaneNode
}

export type SerializedTwoColumnNode = Spread<
  SerializedElementNode,
  {
    type: 'twoColumn'
    /** Originating PT block `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class TwoColumnNode extends ElementNode {
  static getType(): string {
    return 'twoColumn'
  }

  static clone(node: TwoColumnNode): TwoColumnNode {
    return new TwoColumnNode(node.__ptKey, node.__key)
  }

  __ptKey: string | undefined

  constructor(ptKey?: string, key?: NodeKey) {
    super(key)
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedTwoColumnNode): TwoColumnNode {
    return $createTwoColumnNode(serializedNode.ptKey).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTwoColumnNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedTwoColumnNode {
    return {
      ...super.exportJSON(),
      type: 'twoColumn',
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio (element: createDOM/updateDOM + import/export) ----------------

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('section')
    element.setAttribute('data-pt-two-column', '')
    element.className = TWO_COLUMN_CLASS
    return element
  }

  updateDOM(_prevNode: TwoColumnNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  static importDOM(): DOMConversionMap | null {
    return {
      section: (element: HTMLElement) => {
        if (element.getAttribute('data-pt-two-column') === null) {
          return null
        }
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({ node: $createTwoColumnNode(ptKey) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(_editor)
    if (isHTMLElement(element) && this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    return { element }
  }
}

export function $createTwoColumnNode(ptKey?: string): TwoColumnNode {
  return $applyNodeReplacement(new TwoColumnNode(ptKey))
}

export function $isTwoColumnNode(node: LexicalNode | null | undefined): node is TwoColumnNode {
  return node instanceof TwoColumnNode
}
