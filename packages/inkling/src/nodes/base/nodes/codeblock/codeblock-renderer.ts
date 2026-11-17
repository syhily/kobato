import type { RenderContext } from '../../render-context'

import { SHIKI_HTML_CONFIG } from '../../render-context'
import { appendCardCaption } from '../../utils/append-card-caption'
import { hasRenderableSource, renderEmptyContainer } from '../../utils/render-empty-container'

interface CodeBlockNodeData {
  code: string
  language: string
  caption: string
  highlightedHtml: string
}

export function renderCodeBlockNode(node: CodeBlockNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!hasRenderableSource(node.code)) {
    return renderEmptyContainer(document)
  }

  const pre = document.createElement('pre')
  const code = document.createElement('code')

  if (node.language) {
    code.setAttribute('class', `language-${node.language}`)
  }

  if (node.highlightedHtml) {
    // Server-prerendered artifact: emitted verbatim modulo sanitization, with
    // the raw source on `data-code` as the host's copy-button hook.
    if (node.language) {
      code.setAttribute('data-language', node.language)
    }
    code.setAttribute('data-code', node.code)
    code.innerHTML = context.sanitizeCardHtml(node.highlightedHtml, SHIKI_HTML_CONFIG)
  } else {
    code.appendChild(document.createTextNode(node.code))
  }

  pre.appendChild(code)

  if (node.caption) {
    const figure = document.createElement('figure')
    figure.setAttribute('class', 'inkling-card inkling-code-card')
    figure.appendChild(pre)

    appendCardCaption(figure, node.caption, context)

    return { element: figure, type: 'outer' as const }
  }
  return { element: pre, type: 'outer' as const }
}
