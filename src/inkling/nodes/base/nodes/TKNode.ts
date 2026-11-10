import type { EditorConfig, SerializedTextNode } from 'lexical'

import { $applyNodeReplacement, TextNode } from 'lexical'

import { themeClassList } from '@/inkling/themes/inkling-theme-classes'

export class TKNode extends TextNode {
  static getType() {
    return 'tk'
  }

  static clone(node: TKNode) {
    return new TKNode(node.__text, node.__key)
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config)
    const classes = themeClassList(config.theme, 'tk')
    element.classList.add(...classes)
    element.dataset.inklingTk = 'true'
    return element
  }

  static importJSON(serializedNode: SerializedTextNode): TKNode {
    return new TKNode(serializedNode.text).updateFromJSON(serializedNode)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tk',
    }
  }

  canInsertTextBefore() {
    return false
  }

  isTextEntity() {
    return true
  }
}

/** A `#tag` text entity (e.g. `#lexical`). */
export function $createTKNode(text: string) {
  return $applyNodeReplacement(new TKNode(text))
}

export function $isTKNode(node: unknown): node is TKNode {
  return node instanceof TKNode
}
