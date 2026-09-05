import type { RenderContext } from '@/nodes/base/render-context'

import { appendCardCaption } from '@/nodes/base/utils/append-card-caption'
import { isSafeRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

interface BookmarkNodeData {
  url: string
  title: string
  description: string
  icon: string
  author: string
  publisher: string
  thumbnail: string
  caption: string
}

function getSafeMediaUrls(node: BookmarkNodeData, context: RenderContext) {
  return {
    safeIcon: context.safeUrl('media', node.icon),
    safeThumbnail: context.safeUrl('media', node.thumbnail),
  }
}

export function renderBookmarkNode(node: BookmarkNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!isSafeRenderableSource(context, 'navigation', node.url)) {
    return renderEmptyContainer(document)
  }

  return frontendTemplate(node, document, context)
}

function frontendTemplate(node: BookmarkNodeData, document: Document, context: RenderContext) {
  const { safeIcon, safeThumbnail } = getSafeMediaUrls(node, context)

  const element = document.createElement('figure')
  const caption = node.caption
  element.setAttribute('class', 'inkling-card inkling-bookmark-card')

  const container = document.createElement('a')
  container.setAttribute('class', 'inkling-bookmark-container')
  container.href = context.safeUrl('navigation', node.url)
  element.appendChild(container)

  const content = document.createElement('div')
  content.setAttribute('class', 'inkling-bookmark-content')
  container.appendChild(content)

  const title = document.createElement('div')
  title.setAttribute('class', 'inkling-bookmark-title')
  title.textContent = node.title
  content.appendChild(title)

  const description = document.createElement('div')
  description.setAttribute('class', 'inkling-bookmark-description')
  description.textContent = node.description
  content.appendChild(description)

  const metadata = document.createElement('div')
  metadata.setAttribute('class', 'inkling-bookmark-metadata')
  content.appendChild(metadata)

  if (safeIcon) {
    const icon = document.createElement('img')
    icon.setAttribute('class', 'inkling-bookmark-icon')
    icon.src = safeIcon
    icon.alt = ''
    metadata.appendChild(icon)
  }

  const nodePublisher = node.publisher
  if (nodePublisher) {
    const publisher = document.createElement('span')
    publisher.setAttribute('class', 'inkling-bookmark-author') // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
    publisher.textContent = nodePublisher
    metadata.appendChild(publisher)
  }

  const nodeAuthor = node.author
  if (nodeAuthor) {
    const author = document.createElement('span')
    author.setAttribute('class', 'inkling-bookmark-publisher') // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
    author.textContent = nodeAuthor
    metadata.appendChild(author)
  }

  if (safeThumbnail) {
    const thumbnailDiv = document.createElement('div')
    thumbnailDiv.setAttribute('class', 'inkling-bookmark-thumbnail')
    container.appendChild(thumbnailDiv)

    const thumbnail = document.createElement('img')
    thumbnail.src = safeThumbnail
    thumbnail.alt = ''
    thumbnail.setAttribute('onerror', `this.style.display = 'none'`) // Hide thumbnail div if image fails to load
    thumbnailDiv.appendChild(thumbnail)
  }

  if (caption) {
    appendCardCaption(element, caption, context)
  }

  return { element, type: 'outer' as const }
}
