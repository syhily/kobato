import type { ExportDOMOptions } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, SerializedTextNode } from 'lexical'

import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import { footnoteAnchorHref, footnoteRefId } from '@kobato/inkling-internal/nodes/footnote/footnote-anchors'
import { resolveImportedFootnoteTargetKey } from '@kobato/inkling-internal/nodes/footnote/footnote-keys'
import { $applyNodeReplacement, TextNode } from 'lexical'

export type SerializedFootnoteRefNode = SerializedTextNode & {
  targetKey: string
}

export class FootnoteRefNode extends TextNode {
  __targetKey: string

  static getType() {
    return 'footnote-ref'
  }

  static clone(node: FootnoteRefNode) {
    return new FootnoteRefNode(node.__text, node.__targetKey, node.__key)
  }

  constructor(text: string, targetKey: string, key?: string) {
    super(text, key)
    this.__targetKey = targetKey
  }

  get targetKey(): string {
    return this.getLatest().__targetKey
  }

  set targetKey(value: string) {
    this.getWritable().__targetKey = value
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config)
    element.classList.add('inkling-footnote-ref')
    element.dataset.inklingFootnoteRef = 'true'
    return element
  }

  static importJSON(serializedNode: SerializedFootnoteRefNode): FootnoteRefNode {
    const targetKey = typeof serializedNode.targetKey === 'string' ? serializedNode.targetKey : ''
    return new FootnoteRefNode(serializedNode.text, targetKey).updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedFootnoteRefNode {
    return {
      ...super.exportJSON(),
      type: 'footnote-ref',
      targetKey: this.__targetKey,
    }
  }

  exportDOM(_editor: LexicalEditor, options: ExportDOMOptions = {}): DOMExportOutput {
    const context = createRenderContext(options)
    const document = context.createDocument()

    const label = this.getTextContent()
    const index = /^\d+$/.test(label) ? Number(label) : null
    const sup = document.createElement('sup')
    if (index !== null) {
      sup.setAttribute('id', footnoteRefId(index))
    }
    const anchor = document.createElement('a')
    if (index !== null) {
      anchor.setAttribute('href', footnoteAnchorHref(index))
    }
    anchor.textContent = label
    sup.appendChild(anchor)
    return { element: sup }
  }

  static importDOM(): DOMConversionMap {
    return {
      sup: (node: HTMLElement) => {
        const parsed = parseFootnoteRefSup(node)
        if (!parsed) {
          return null
        }
        return {
          conversion: () => ({
            node: $createFootnoteRefNode(
              parsed.label,
              resolveImportedFootnoteTargetKey(node.ownerDocument, parsed.slug),
            ),
          }),
          priority: 1 as const,
        }
      },
    }
  }

  canInsertTextBefore() {
    return false
  }

  canInsertTextAfter() {
    return false
  }

  isTextEntity() {
    return true
  }

  isInlineMarkupEntity() {
    return true
  }
}

function parseFootnoteRefSup(node: HTMLElement): { slug: string; label: string } | null {
  const ownAnchor = node.querySelector('a[href^="#user-content-fn-"]')
  if (ownAnchor) {
    const href = ownAnchor.getAttribute('href') ?? ''
    return { slug: href.slice(1), label: ownAnchor.textContent ?? '' }
  }

  if (!node.classList.contains('footnote-ref')) {
    return null
  }
  const anchor = node.querySelector('a')
  if (!anchor) {
    return null
  }
  const href = anchor.getAttribute('href')
  let slug = href?.startsWith('#') ? href.slice(1) : ''
  if (!slug) {
    const id = anchor.getAttribute('id') ?? ''
    slug = id.replace(/^fnref/, 'fn').split(':')[0]
  }
  if (!slug) {
    return null
  }
  const bracketed = /^\[(\d+)(?::\d+)?\]$/.exec(anchor.textContent ?? '')
  return { slug, label: bracketed ? bracketed[1] : (anchor.textContent ?? '') }
}

export function $createFootnoteRefNode(text: string, targetKey: string): FootnoteRefNode {
  return $applyNodeReplacement(new FootnoteRefNode(text, targetKey))
}

export function $isFootnoteRefNode(node: unknown): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode
}
