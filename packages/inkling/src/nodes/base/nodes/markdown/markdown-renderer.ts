import type { ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import { getLoadedPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'

interface MarkdownNodeData {
  markdown: string
}

export function renderMarkdownNode(node: MarkdownNodeData, context: RenderContext): ExportDOMOutput<'inner'> {
  const document = context.createDocument()

  const dialect = getLoadedPasteDialect()
  if (!dialect) {
    throw new Error('renderMarkdownNode requires the paste dialect chunk — await loadPasteDialect() first')
  }

  const html = context.sanitizeBasicHtml(
    dialect.render(node.markdown || '', { inklingVersion: context.resolveExportPolicy('inkling-version') }),
  )

  const element = document.createElement('div')
  element.innerHTML = html

  return { element, type: 'inner' as const }
}
