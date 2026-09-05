import type { ExportDOMOutput } from '@/nodes/base/export-dom'
import type { RenderContext, SafeUrlKind } from '@/nodes/base/render-context'

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

/**
 * The blank half of the empty-source guard: a missing or whitespace-only
 * primary source means the card exports the empty container (codeblock's
 * `code`, file's `src`, math's `tex`).
 */
export function hasRenderableSource(value: string | null | undefined): value is string {
  return !!value && value.trim() !== ''
}

/**
 * The empty-source guard the URL-bearing renderers share: a blank primary
 * source — or one the URL policy rejects (`safeUrl` returns `''`) — exports
 * the empty container. One home so the "safeUrl's empty string means
 * unsafe, and an unsafe primary source means no card" invariant is checked
 * once, never re-derived per renderer.
 */
export function isSafeRenderableSource(
  context: RenderContext,
  kind: SafeUrlKind,
  value: string | null | undefined,
): boolean {
  return hasRenderableSource(value) && context.safeUrl(kind, value) !== ''
}
