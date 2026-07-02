import type { ExportDOMOptions, ExportDOMOutput } from '@/ui/inkling-editor/nodes/base/export-dom'

import { render } from '@/ui/inkling-editor/markdown'
import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'

interface MarkdownNodeData {
  markdown: string
}

interface MarkdownRenderOptions extends ExportDOMOptions {}

export function renderMarkdownNode(
  node: MarkdownNodeData,
  options: MarkdownRenderOptions = {},
): ExportDOMOutput<'inner'> {
  addCreateDocumentOption(options)
  if (typeof options.createDocument !== 'function') {
    throw new TypeError('renderMarkdownNode requires options.createDocument to be a function')
  }

  const document = options.createDocument()

  const html = render(node.markdown || '', options as Record<string, unknown>)

  const element = document.createElement('div')
  element.innerHTML = html

  // `type: 'inner'` will render only the innerHTML of the element
  // @see the editor's HTML renderer
  return { element, type: 'inner' as const }
}
