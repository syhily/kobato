import type { ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import { renderEmptyContainer } from '@kobato/inkling-internal/nodes/base/utils/render-empty-container'

interface HtmlNodeData {
  html: string
}

export type HtmlExportDOMOutput = ExportDOMOutput<'inner' | 'value' | 'outer'>

export function renderHtmlNode(node: HtmlNodeData, context: RenderContext): HtmlExportDOMOutput {
  const document = context.createDocument()

  const html = node.html

  if (!html) {
    return renderEmptyContainer(document)
  }

  const wrappedHtml = `\n<!--inkling-card-begin: html-->\n${html}\n<!--inkling-card-end: html-->\n`

  const textarea = document.createElement('textarea')
  textarea.value = wrappedHtml

  return { element: textarea, type: 'value' as const }
}
