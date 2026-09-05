import type { RenderContext } from '@/nodes/base/render-context'

import { hasRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'
import { bytesToSize } from '@/nodes/base/utils/size-byte-converter'

interface FileNodeData {
  src: string
  fileTitle: string
  fileCaption: string
  fileName: string
  fileSize: number
}

export function renderFileNode(node: FileNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!hasRenderableSource(node.src)) {
    return renderEmptyContainer(document)
  }

  return cardTemplate(node, document, context)
}

function cardTemplate(node: FileNodeData, document: Document, context: RenderContext) {
  const card = document.createElement('div')
  card.setAttribute('class', 'inkling-card inkling-file-card')

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
  // same value the BaseFileNode.formattedFileSize getter computes (bytesToSize
  // never returns an empty string)
  filesize.textContent = bytesToSize(node.fileSize)

  metadata.appendChild(filename)
  metadata.appendChild(filesize)

  contents.appendChild(title)
  contents.appendChild(caption)
  contents.appendChild(metadata)

  let container: HTMLElement
  const safeSrc = context.safeUrl('navigation', node.src)
  if (safeSrc) {
    const anchor = document.createElement('a')
    anchor.setAttribute('class', 'inkling-file-card-container')
    anchor.setAttribute('href', safeSrc)
    anchor.setAttribute('title', 'Download')
    anchor.setAttribute('download', '')
    container = anchor
  } else {
    container = document.createElement('div')
    container.setAttribute('class', 'inkling-file-card-container')
  }

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
