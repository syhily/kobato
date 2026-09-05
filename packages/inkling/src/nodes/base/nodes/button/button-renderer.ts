import type { RenderContext } from '@/nodes/base/render-context'

import { isSafeRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

interface ButtonNodeData {
  buttonUrl: string
  buttonText: string
  alignment: string
}

export function renderButtonNode(node: ButtonNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!isSafeRenderableSource(context, 'navigation', node.buttonUrl)) {
    return renderEmptyContainer(document)
  }

  return frontendTemplate(node, document, context)
}

function frontendTemplate(node: ButtonNodeData, document: Document, context: RenderContext) {
  const cardClasses = getCardClasses(node)
  const safeButtonUrl = context.safeUrl('navigation', node.buttonUrl)

  const cardDiv = document.createElement('div')
  cardDiv.setAttribute('class', cardClasses)

  const button = document.createElement('a')
  button.setAttribute('href', safeButtonUrl)
  button.setAttribute('class', 'inkling-btn inkling-btn-accent')
  button.textContent = node.buttonText || 'Button Title'

  cardDiv.appendChild(button)
  return { element: cardDiv, type: 'outer' as const }
}

function getCardClasses(node: ButtonNodeData) {
  const cardClasses = ['inkling-card inkling-button-card']

  if (node.alignment) {
    cardClasses.push(`inkling-align-${node.alignment}`)
  }

  return cardClasses.join(' ')
}
