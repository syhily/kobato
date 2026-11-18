import type { ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

// The markdown card's HTML export speaks the paste dialect. exportDOM is a
// sync pipeline, so the engine comes from the lazy port's loaded cache
// (`@kobato/inkling-internal/markdown/lazy-paste-dialect`) — pre-warmed on editor mount in
// the browser and statically seeded by the headless HTML surface.
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

  // pasteDialect.render reads exactly one key off the options bag —
  // `inklingVersion` (its slug-policy input) — resolved through the keyed
  // policy seam, byte-identical to forwarding the whole bag.
  const html = context.sanitizeBasicHtml(
    dialect.render(node.markdown || '', { inklingVersion: context.resolveExportPolicy('inkling-version') }),
  )

  const element = document.createElement('div')
  element.innerHTML = html

  // `type: 'inner'` will render only the innerHTML of the element
  // @see the editor's HTML renderer
  return { element, type: 'inner' as const }
}
