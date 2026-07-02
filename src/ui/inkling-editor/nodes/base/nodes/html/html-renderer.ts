import type { ExportDOMOptions, ExportDOMOutput } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { renderEmptyContainer } from '@/ui/inkling-editor/nodes/base/utils/render-empty-container'
import { renderWithVisibility } from '@/ui/inkling-editor/nodes/base/utils/visibility'

interface HtmlNodeData {
  html: string
  visibility?: Record<string, unknown>
}

export type HtmlExportDOMOutput = ExportDOMOutput<'inner' | 'value' | 'html'>

export function renderHtmlNode(node: HtmlNodeData, options: ExportDOMOptions = {}): HtmlExportDOMOutput {
  addCreateDocumentOption(options)
  const document = options.createDocument!()

  const html = node.html

  if (!html) {
    return renderEmptyContainer(document)
  }

  const wrappedHtml = `\n<!--inkling-card-begin: html-->\n${html}\n<!--inkling-card-end: html-->\n`

  const textarea = document.createElement('textarea')
  textarea.value = wrappedHtml

  if (node.visibility) {
    const renderOutput: ExportDOMOutput<'value'> = { element: textarea, type: 'value' }
    return renderWithVisibility(renderOutput, node.visibility, options) as HtmlExportDOMOutput
  }

  // `type: 'value'` will render the value of the textarea element
  return { element: textarea, type: 'value' as const }
}
