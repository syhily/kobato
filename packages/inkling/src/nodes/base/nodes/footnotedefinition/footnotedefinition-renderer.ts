import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import {
  FOOTNOTE_BACKREF_ATTRIBUTE,
  footnoteAnchorId,
  footnoteRefHref,
} from '@kobato/inkling-internal/nodes/footnote/footnote-anchors'

interface FootnoteDefinitionNodeData {
  content: string
  targetKey: string
  getFootnoteIndex(): number
}

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
