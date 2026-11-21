import type { ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { RenderContext, SafeUrlKind } from '@kobato/inkling-internal/nodes/base/render-context'

export type EmptyContainerOutput = ExportDOMOutput<'inner'>

export function renderEmptyContainer(document: Document): EmptyContainerOutput {
  const emptyContainer = document.createElement('span')
  return { element: emptyContainer, type: 'inner' as const }
}

export function hasRenderableSource(value: string | null | undefined): value is string {
  return !!value && value.trim() !== ''
}

export function isSafeRenderableSource(
  context: RenderContext,
  kind: SafeUrlKind,
  value: string | null | undefined,
): boolean {
  return hasRenderableSource(value) && context.safeUrl(kind, value) !== ''
}
