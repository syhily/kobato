import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Horizontal rule block node. Upstream lexical 0.45.0 moved
// `HorizontalRuleNode` into `@lexical/extension`; this hand-rolled copy
// (same `getType()` → `'horizontalrule'`, same `{type, version}`
// serialization) keeps the R1 dependency list closed. DOM: `<hr/>`
// both ways — matching the render contract.

export type SerializedHorizontalRuleNode = SerializedLexicalNode & {
  type: 'horizontalrule'
}

export class HorizontalRuleNode extends DecoratorNode<undefined> {
  static getType(): string {
    return 'horizontalrule'
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key)
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  static importJSON(_serializedNode: SerializedHorizontalRuleNode): HorizontalRuleNode {
    return $createHorizontalRuleNode()
  }

  exportJSON(): SerializedHorizontalRuleNode {
    return {
      type: 'horizontalrule',
      version: 1,
    }
  }

  isInline(): boolean {
    return false
  }

  // --- DOM trio ---------------------------------------------------------------

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    return document.createElement('hr')
  }

  updateDOM(_prevNode: HorizontalRuleNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: () => ({ node: $createHorizontalRuleNode() }),
        priority: 1,
      }),
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    return { element: document.createElement('hr') }
  }
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return $applyNodeReplacement(new HorizontalRuleNode())
}

export function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode
}
