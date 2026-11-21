import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import { CALLOUT_HTML_CONFIG } from '@kobato/inkling-internal/nodes/base/render-context'

interface CalloutNodeData {
  backgroundColor: string
  calloutEmoji: string
  calloutText: string
}

export function renderCalloutNode(node: CalloutNodeData, context: RenderContext) {
  const document = context.createDocument()
  const element = document.createElement('div')

  const backgroundColor = /^[a-zA-Z\d-]+$/.test(node.backgroundColor) ? node.backgroundColor : 'white'

  element.classList.add('inkling-card', 'inkling-callout-card', `inkling-callout-card-${backgroundColor}`)

  if (node.calloutEmoji) {
    const emojiElement = document.createElement('div')
    emojiElement.classList.add('inkling-callout-emoji')
    emojiElement.textContent = node.calloutEmoji
    element.appendChild(emojiElement)
  }

  const textElement = document.createElement('div')
  textElement.classList.add('inkling-callout-text')
  textElement.innerHTML = context.sanitizeCardHtml(node.calloutText, CALLOUT_HTML_CONFIG)
  element.appendChild(textElement)

  return { element, type: 'outer' as const }
}
