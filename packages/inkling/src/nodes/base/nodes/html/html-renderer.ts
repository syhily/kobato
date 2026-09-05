import type { ExportDOMOutput } from '@/nodes/base/export-dom'
import type { RenderContext } from '@/nodes/base/render-context'

import { renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

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

  // `type: 'value'` will render the value of the textarea element
  return { element: textarea, type: 'value' as const }
}
