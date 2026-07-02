import type { ExportDOMOutput } from '@/ui/inkling-editor/nodes/base/export-dom'

/*
 * Renders an empty container element
 * In the returned object, `type: 'inner'` is picked up by the editor's HTML renderer
 * to render the inner content of the container element (in this case, nothing)
 *
 * @see the original upstream lexical HTML renderer package
 */
export type EmptyContainerOutput = ExportDOMOutput<'inner'>

export function renderEmptyContainer(document: Document): EmptyContainerOutput {
  const emptyContainer = document.createElement('span')
  return { element: emptyContainer, type: 'inner' as const }
}
