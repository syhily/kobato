import type { RenderContext } from '@/nodes/base/render-context'

import { SHIKI_HTML_CONFIG } from '@/nodes/base/render-context'
import { appendCardCaption } from '@/nodes/base/utils/append-card-caption'
import { hasRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

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

    // the marker class rides the seam like every other captioned card —
    // codeblock's bare-figure export was drift, not policy
    appendCardCaption(figure, node.caption, context)

    return { element: figure, type: 'outer' as const }
  } else {
    return { element: pre, type: 'outer' as const }
  }
}
