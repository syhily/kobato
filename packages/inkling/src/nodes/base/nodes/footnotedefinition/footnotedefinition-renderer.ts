import type { RenderContext } from '@/nodes/base/render-context'

import { FOOTNOTE_BACKREF_ATTRIBUTE, footnoteAnchorId, footnoteRefHref } from '@/nodes/footnote/footnote-anchors'

interface FootnoteDefinitionNodeData {
  content: string
  targetKey: string
  getFootnoteIndex(): number
}

/**
 * <li id="user-content-fn-N">…<a data-footnote-backref href="#user-content-fnref-N">↩</a></li>
 * — one definition row. The `<section class="footnotes">` wrapper is NOT the
 * renderer's business: the doc-end-run invariant (the footnote behaviour
 * module's RootNode transform) guarantees every definition exports as one
 * trailing run, so the section wrap is a mechanical string-layer step in
 * `@/html/renderer/convert-to-html-string`. Anchors come from the single
 * contract owner (`@/nodes/footnote/footnote-anchors`).
 */
export function renderFootnoteDefinitionNode(node: FootnoteDefinitionNodeData, context: RenderContext) {
  const document = context.createDocument()
  const index = node.getFootnoteIndex()

  const li = document.createElement('li')
  li.setAttribute('id', footnoteAnchorId(index))
  li.innerHTML = context.sanitizeBasicHtml(node.content)

  const backref = document.createElement('a')
  backref.setAttribute(FOOTNOTE_BACKREF_ATTRIBUTE, '')
  backref.setAttribute('href', footnoteRefHref(index))
  backref.textContent = '↩'
  li.appendChild(backref)

  return { element: li, type: 'outer' as const }
}
