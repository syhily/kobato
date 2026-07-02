import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { renderEmptyContainer } from '@/ui/inkling-editor/nodes/base/utils/render-empty-container'

interface CodeBlockNodeData {
  code: string
  language: string
  caption: string
}

export function renderCodeBlockNode(node: CodeBlockNodeData, options: ExportDOMOptions = {}) {
  addCreateDocumentOption(options)
  const document = options.createDocument!()

  if (!node.code || node.code.trim() === '') {
    return renderEmptyContainer(document)
  }

  const pre = document.createElement('pre')
  const code = document.createElement('code')

  if (node.language) {
    code.setAttribute('class', `language-${node.language}`)
  }

  code.appendChild(document.createTextNode(node.code))
  pre.appendChild(code)

  if (node.caption) {
    const figure = document.createElement('figure')
    figure.setAttribute('class', 'inkling-card inkling-code-card')
    figure.appendChild(pre)

    const figcaption = document.createElement('figcaption')
    figcaption.innerHTML = node.caption
    figure.appendChild(figcaption)

    return { element: figure, type: 'outer' as const }
  } else {
    return { element: pre, type: 'outer' as const }
  }
}
