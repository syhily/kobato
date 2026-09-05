import type { RenderContext } from '@/nodes/base/render-context'

import { CALLOUT_HTML_CONFIG } from '@/nodes/base/render-context'

interface CalloutNodeData {
  backgroundColor: string
  calloutEmoji: string
  calloutText: string
}

export function renderCalloutNode(node: CalloutNodeData, context: RenderContext) {
  const document = context.createDocument()
  const element = document.createElement('div')

  // backgroundColor can end up with `rgba(0, 0, 0, 0)` from old mobiledoc copy/paste
  // that is invalid when used in a class name so fall back to `white` when we don't have
  // something that looks like a valid class. Computed locally: the render fn must not
  // write to the node (the render context is read-only, and a node write here would
  // clone-on-write during export).
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
