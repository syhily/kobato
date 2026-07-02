import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { escapeHtml } from '@/ui/inkling-editor/nodes/base/utils/escape-html'
import { getFirstHtmlElement } from '@/ui/inkling-editor/nodes/base/utils/get-first-html-element'
import { renderEmptyContainer } from '@/ui/inkling-editor/nodes/base/utils/render-empty-container'
import { bytesToSize } from '@/ui/inkling-editor/nodes/base/utils/size-byte-converter'

interface FileNodeData {
  src: string
  fileTitle: string
  fileCaption: string
  fileName: string
  fileSize: number
  formattedFileSize: string
}

export function renderFileNode(node: FileNodeData, options: ExportDOMOptions = {}) {
  addCreateDocumentOption(options)
  const document = options.createDocument!()

  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document)
  }

  if (options.target === 'email') {
    return emailTemplate(node, document, options)
  } else {
    return cardTemplate(node, document)
  }
}

function wrapWithAnchor(content: string, href: string | undefined, cls: string, style?: string) {
  if (href) {
    const styleAttr = style ? ` style="${style}"` : ''
    return `<a href="${escapeHtml(href)}" class="${cls}"${styleAttr}>${content}</a>`
  }
  return `<span class="${cls}">${content}</span>`
}

function emailTemplate(node: FileNodeData, document: Document, options: ExportDOMOptions) {
  let iconCls
  if (!node.fileTitle && !node.fileCaption) {
    iconCls = 'margin-top: 6px; height: 20px; width: 20px; max-width: 20px; padding-top: 4px; padding-bottom: 4px;'
  } else {
    iconCls = 'margin-top: 6px; height: 24px; width: 24px; max-width: 24px;'
  }

  const href = options.postUrl || node.src || undefined

  const html = `
        <table cellspacing="0" cellpadding="4" border="0" class="inkling-file-card" width="100%">
            <tr>
                <td>
                    <table cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                            <td valign="middle" style="vertical-align: middle;">
                                ${
                                  node.fileTitle
                                    ? `
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    ${wrapWithAnchor(escapeHtml(node.fileTitle), href, 'inkling-file-title')}
                                </td></tr></table>
                                `
                                    : ``
                                }
                                ${
                                  node.fileCaption
                                    ? `
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    ${wrapWithAnchor(escapeHtml(node.fileCaption), href, 'inkling-file-description')}
                                </td></tr></table>
                                `
                                    : ``
                                }
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    ${wrapWithAnchor(`<span class="inkling-file-name">${escapeHtml(node.fileName)}</span> &bull; ${bytesToSize(node.fileSize)}`, href, 'inkling-file-meta')}
                                </td></tr></table>
                            </td>
                            <td width="80" valign="middle" class="inkling-file-thumbnail">
                                ${
                                  href
                                    ? `<a href="${escapeHtml(href)}" style="display: block; top: 0; right: 0; bottom: 0; left: 0;">
                                    <img src="https://static.inkling.local/v4.0.0/images/download-icon-darkmode.png" style="${escapeHtml(iconCls)}">
                                </a>`
                                    : `<img src="https://static.inkling.local/v4.0.0/images/download-icon-darkmode.png" style="${escapeHtml(iconCls)}">`
                                }
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    `

  const container = document.createElement('div')
  container.innerHTML = html.trim()

  return { element: getFirstHtmlElement(container, 'renderFileNode emailTemplate'), type: 'outer' as const }
}

function cardTemplate(node: FileNodeData, document: Document) {
  const card = document.createElement('div')
  card.setAttribute('class', 'inkling-card inkling-file-card')

  const container = document.createElement('a')
  container.setAttribute('class', 'inkling-file-card-container')
  container.setAttribute('href', node.src)
  container.setAttribute('title', 'Download')
  container.setAttribute('download', '')

  const contents = document.createElement('div')
  contents.setAttribute('class', 'inkling-file-card-contents')

  const title = document.createElement('div')
  title.setAttribute('class', 'inkling-file-card-title')
  title.textContent = node.fileTitle || ''

  const caption = document.createElement('div')
  caption.setAttribute('class', 'inkling-file-card-caption')
  caption.textContent = node.fileCaption || ''

  const metadata = document.createElement('div')
  metadata.setAttribute('class', 'inkling-file-card-metadata')

  const filename = document.createElement('div')
  filename.setAttribute('class', 'inkling-file-card-filename')
  filename.textContent = node.fileName || ''

  const filesize = document.createElement('div')
  filesize.setAttribute('class', 'inkling-file-card-filesize')
  filesize.textContent = node.formattedFileSize || ''

  metadata.appendChild(filename)
  metadata.appendChild(filesize)

  contents.appendChild(title)
  contents.appendChild(caption)
  contents.appendChild(metadata)

  container.appendChild(contents)

  const icon = document.createElement('div')
  icon.setAttribute('class', 'inkling-file-card-icon')

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = '.a{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5px;}'

  defs.appendChild(style)

  const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title')
  titleElement.textContent = 'download-circle'

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  polyline.setAttribute('class', 'a')
  polyline.setAttribute('points', '8.25 14.25 12 18 15.75 14.25')

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line.setAttribute('class', 'a')
  line.setAttribute('x1', '12')
  line.setAttribute('y1', '6.75')
  line.setAttribute('x2', '12')
  line.setAttribute('y2', '18')

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.setAttribute('class', 'a')
  circle.setAttribute('cx', '12')
  circle.setAttribute('cy', '12')
  circle.setAttribute('r', '11.25')

  svg.appendChild(defs)
  svg.appendChild(titleElement)
  svg.appendChild(polyline)
  svg.appendChild(line)
  svg.appendChild(circle)

  icon.appendChild(svg)
  container.appendChild(icon)
  card.appendChild(container)

  return { element: card, type: 'outer' as const }
}
