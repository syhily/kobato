import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { DecoratorNode } from 'lexical'

export interface SerializedProbeBlockCardNode extends SerializedLexicalNode {
  type: 'probe-block-card'
  version: number
}

export class ProbeBlockCardNode extends DecoratorNode<null> {
  static getType(): string {
    return 'probe-block-card'
  }

  static clone(node: ProbeBlockCardNode): ProbeBlockCardNode {
    return new ProbeBlockCardNode(node.__key)
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div')
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

  isKeyboardSelectable(): boolean {
    return true
  }

  exportJSON(): SerializedProbeBlockCardNode {
    return {
      ...super.exportJSON(),
      type: 'probe-block-card',
      version: 1,
    }
  }

  static importJSON(): ProbeBlockCardNode {
    return new ProbeBlockCardNode()
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-probe-block-card', 'true')
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingProbeBlockCard === 'true') {
          return {
            conversion: () => ({ node: new ProbeBlockCardNode() }),
            priority: 1,
          }
        }
        return null
      },
    }
  }
}

export function $createProbeBlockCardNode(): ProbeBlockCardNode {
  return new ProbeBlockCardNode()
}

export function $isProbeBlockCardNode(node: unknown): node is ProbeBlockCardNode {
  return node instanceof ProbeBlockCardNode
}
