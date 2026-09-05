import type { EditorConfig, SerializedTextNode } from 'lexical'

import { $applyNodeReplacement, TextNode } from 'lexical'

import { themeClassList } from '@/themes/inkling-theme-classes'

export class TKNode extends TextNode {
  static getType() {
    return 'tk'
  }

  static clone(node: TKNode) {
    return new TKNode(node.__text, node.__key)
  }

  constructor(text: string, key?: string) {
    super(text, key)
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

/**
 * Generates a TKNode, which is a string following the format of a # followed by some text, eg. #lexical.
 * @param text - The text used inside the TKNode.
 * @returns - The TKNode with the embedded text.
 */
export function $createTKNode(text: string) {
  return $applyNodeReplacement(new TKNode(text))
}

/**
 * Determines if node is a TKNode.
 * @param node - The node to be checked.
 * @returns true if node is a TKNode, false otherwise.
 */
export function $isTKNode(node: unknown): node is TKNode {
  return node instanceof TKNode
}
