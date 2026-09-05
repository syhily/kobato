import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, SerializedTextNode } from 'lexical'

import { $applyNodeReplacement, TextNode } from 'lexical'

import type { ExportDOMOptions } from '@/nodes/base/export-dom'

import { createRenderContext } from '@/nodes/base/render-context'
import { footnoteAnchorHref, footnoteRefId } from '@/nodes/footnote/footnote-anchors'
import { resolveImportedFootnoteTargetKey } from '@/nodes/footnote/footnote-keys'

export type SerializedFootnoteRefNode = SerializedTextNode & {
  targetKey: string
}

/**
 * Inline footnote reference (CONTEXT.md: footnote ref) — a TextNode entity
 * (TKNode precedent) whose visible text IS the 1-based index; the renumber
 * engine (`@/plugins/behaviour/footnotes`) rewrites the text in place, so no
 * separate index field can drift from what the reader sees. `__targetKey`
 * points at the definition card it cites (kobato's `footnoteRef.targetKey`).
 * Atomicity comes from `isTextEntity()` + the `canInsertText*` pair, exactly
 * like TKNode.
 */
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
    // Trust boundary like MathInlineNode's importJSON: a hand-crafted payload
    // can omit targetKey, and `undefined` would violate the field's `string`
    // type — fall back to '' so the ref lands on the renumber engine's skip
    // path (no resolvable definition) instead of carrying a phantom key
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

  // <sup id="user-content-fnref-N"><a href="#user-content-fn-N">N</a></sup> —
  // the anchors come from the single contract owner (`./footnote-anchors`);
  // N is the node's own text, which the renumber engine keeps equal to the
  // ref's citation index. A non-numeric label (e.g. an unbracketed
  // markdown-it import) carries no index — indexing is skipped rather than
  // leaking `fnref-NaN`.
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

  // Two import lanes (CONTEXT.md: footnote ref): inkling/kobato HTML carries
  // `a[href^="#user-content-fn-"]` inside the sup; the markdown-it-footnote
  // paste dialect emits `sup.footnote-ref` (its fragment hrefs survive the
  // headless importer, and the anchor `id="fnrefN[:M]"` remains when the
  // paste sanitize strips fragment hrefs). Either way the source anchor slug
  // only correlates ref and definition — the targetKey itself is recast on
  // import (import-is-a-new-entity, see ./footnote-keys).
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

  // The string layer splices this node's exportDOM markup (`<sup><a…>`)
  // into the text flow instead of adding it to the pending text run — the
  // inline-markup-entity protocol (`@/nodes/base/export-dom`).
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

  // markdown-it-footnote lane: <sup class="footnote-ref"><a href="#fnN"
  // id="fnrefN">[N]</a></sup>
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
    // the paste sanitize strips fragment hrefs; the anchor id keeps the slug
    // (`fnrefN`, `fnrefN:M` for repeated references to one note)
    const id = anchor.getAttribute('id') ?? ''
    slug = id.replace(/^fnref/, 'fn').split(':')[0]
  }
  if (!slug) {
    return null
  }
  // markdown-it labels a repeated reference `[N:M]` (the Mth citation of
  // note N) — the visible index is N in both cases
  const bracketed = /^\[(\d+)(?::\d+)?\]$/.exec(anchor.textContent ?? '')
  return { slug, label: bracketed ? bracketed[1] : (anchor.textContent ?? '') }
}

export function $createFootnoteRefNode(text: string, targetKey: string): FootnoteRefNode {
  return $applyNodeReplacement(new FootnoteRefNode(text, targetKey))
}

export function $isFootnoteRefNode(node: unknown): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode
}
