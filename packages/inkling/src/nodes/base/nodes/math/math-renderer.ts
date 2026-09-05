import type { RenderContext } from '@/nodes/base/render-context'

import { MATH_HTML_CONFIG } from '@/nodes/base/render-context'
import { hasRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

import { resolveMathArtifact } from './math-artifacts'

interface MathNodeData {
  tex: string
  mathml: string
  svg: string
}

export function renderMathNode(node: MathNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!hasRenderableSource(node.tex)) {
    return renderEmptyContainer(document)
  }

  const artifact = resolveMathArtifact(node)
  if (artifact) {
    // Server-prerendered artifact: emitted verbatim modulo sanitization.
    const container = document.createElement('div')
    container.setAttribute('class', 'inkling-card inkling-math-card')
    container.innerHTML = context.sanitizeCardHtml(artifact.html, MATH_HTML_CONFIG)
    return { element: container, type: 'outer' as const }
  }

  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.appendChild(document.createTextNode(node.tex))
  pre.appendChild(code)
  return { element: pre, type: 'outer' as const }
}
