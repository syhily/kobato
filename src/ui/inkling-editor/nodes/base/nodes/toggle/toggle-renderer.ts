import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { getFirstHtmlElement } from '@/ui/inkling-editor/nodes/base/utils/get-first-html-element'
import { html } from '@/ui/inkling-editor/nodes/base/utils/tagged-template-fns'

interface ToggleNodeData {
  heading: string
  content: string
}

function cardTemplate({ node }: { node: ToggleNodeData }) {
  return `
        <div class="inkling-card inkling-toggle-card" data-inkling-toggle-state="close">
            <div class="inkling-toggle-heading">
                <h4 class="inkling-toggle-heading-text">${node.heading}</h4>
                <button class="inkling-toggle-card-icon" aria-label="Expand toggle to read content">
                    <svg id="Regular" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path class="cls-1" d="M23.25,7.311,12.53,18.03a.749.749,0,0,1-1.06,0L.75,7.311"></path>
                    </svg>
                </button>
            </div>
            <div class="inkling-toggle-content">${node.content}</div>
        </div>
        `
}

function emailCardTemplate({ node }: { node: ToggleNodeData }, options: ExportDOMOptions = {}) {
  if (options.feature?.emailCustomization || options.feature?.emailCustomizationAlpha) {
    return html`
      <table cellspacing="0" cellpadding="0" border="0" width="100%" class="inkling-toggle-card">
        <tbody>
          <tr>
            <td class="inkling-toggle-heading">
              <h4>${node.heading}</h4>
            </td>
          </tr>
          <tr>
            <td class="inkling-toggle-content">${node.content}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
        <div style="background: transparent;
        border: 1px solid rgba(124, 139, 154, 0.25); border-radius: 4px; padding: 20px; margin-bottom: 1.5em;">
            <h4 style="font-size: 1.375rem; font-weight: 600; margin-bottom: 8px; margin-top:0px">${node.heading}</h4>
            <div style="font-size: 1rem; line-height: 1.5; margin-bottom: -1.5em;">${node.content}</div>
        </div>
        `
}

export function renderToggleNode(node: ToggleNodeData, options: ExportDOMOptions = {}) {
  addCreateDocumentOption(options)

  const document = options.createDocument!()

  const htmlString = options.target === 'email' ? emailCardTemplate({ node }, options) : cardTemplate({ node })

  const container = document.createElement('div')
  container.innerHTML = htmlString.trim()

  const element = getFirstHtmlElement(container, 'renderToggleNode')
  return { element, type: 'outer' as const }
}
