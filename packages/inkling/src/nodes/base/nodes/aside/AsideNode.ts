import type { EditorConfig, LexicalEditor, SerializedElementNode } from 'lexical'

import { ElementNode } from 'lexical'

import { AsideParser } from '@/nodes/base/nodes/aside/AsideParser'

export class AsideNode extends ElementNode {
  static getType() {
    return 'aside'
  }

  static clone(node: AsideNode) {
    return new this(node.__key)
  }

  static get urlTransformMap() {
    return {}
  }

  constructor(key?: string) {
    super(key)
  }

  static importJSON(serializedNode: SerializedElementNode) {
    return new this().updateFromJSON(serializedNode)
  }

  exportJSON() {
    const dataset = {
      ...super.exportJSON(),
      type: 'aside',
      version: 1,
    }
    return dataset
  }

  static importDOM() {
    const parser = new AsideParser(this)
    return parser.DOMConversionMap
  }

  /* c8 ignore start */
  createDOM(_config?: EditorConfig, _editor?: LexicalEditor): HTMLElement {
    return document.createElement('div')
  }

  updateDOM() {
    return false
  }

  isInline() {
    return false
  }

  extractWithChild() {
    return true
  }
  /* c8 ignore stop */
}

export function $createAsideNode() {
  return new AsideNode()
}

export function $isAsideNode(node: unknown): node is AsideNode {
  return node instanceof AsideNode
}
