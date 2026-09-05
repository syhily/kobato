import type { RenderContext } from '@/nodes/base/render-context'

import { getFirstHtmlElement } from '@/nodes/base/utils/get-first-html-element'

interface ToggleNodeData {
  heading: string
  content: string
}

// heading is plain text and gets escaped; content is nested-editor HTML and
// gets DOMPurify-sanitized (not escaped) — both via the render context.
function sanitize(node: ToggleNodeData, context: RenderContext) {
  return {
    safeHeading: context.escapeText(node.heading),
    safeContent: context.sanitizeBasicHtml(node.content),
  }
}

function cardTemplate({ node, context }: { node: ToggleNodeData; context: RenderContext }) {
  const { safeHeading, safeContent } = sanitize(node, context)

  return `
        <div class="inkling-card inkling-toggle-card" data-inkling-toggle-state="close">
            <div class="inkling-toggle-heading">
                <h4 class="inkling-toggle-heading-text">${safeHeading}</h4>
                <button class="inkling-toggle-card-icon" aria-label="Expand toggle to read content">
                    <svg id="Regular" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path class="cls-1" d="M23.25,7.311,12.53,18.03a.749.749,0,0,1-1.06,0L.75,7.311"></path>
                    </svg>
                </button>
            </div>
            <div class="inkling-toggle-content">${safeContent}</div>
        </div>
        `
}

export function renderToggleNode(node: ToggleNodeData, context: RenderContext) {
  const document = context.createDocument()

  const htmlString = cardTemplate({ node, context })

  const container = document.createElement('div')
  container.innerHTML = htmlString.trim()

  const element = getFirstHtmlElement(container, 'renderToggleNode')
  return { element, type: 'outer' as const }
}
