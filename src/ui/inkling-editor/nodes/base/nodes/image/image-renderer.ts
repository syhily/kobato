import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { getAvailableImageWidths } from '@/ui/inkling-editor/nodes/base/utils/get-available-image-widths'
import { getResizedImageDimensions } from '@/ui/inkling-editor/nodes/base/utils/get-resized-image-dimensions'
import { isLocalContentImage } from '@/ui/inkling-editor/nodes/base/utils/is-local-content-image'
import { renderEmptyContainer } from '@/ui/inkling-editor/nodes/base/utils/render-empty-container'
import { setSrcsetAttribute } from '@/ui/inkling-editor/nodes/base/utils/srcset-attribute'

interface ImageNodeData {
  src: string
  width: number
  height: number
  alt: string
  title: string
  caption: string
  cardWidth: string
  href: string
}

interface ImageRenderOptions extends ExportDOMOptions {
  imageOptimization?: {
    defaultMaxWidth?: number
    contentImageSizes?: Record<string, { width: number }>
    [key: string]: unknown
  }
}

export function renderImageNode(node: ImageNodeData, options: ImageRenderOptions = {}) {
  addCreateDocumentOption(options)

  const document = options.createDocument!()

  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document)
  }

  const figure = document.createElement('figure')

  let figureClasses = 'inkling-card inkling-image-card'
  if (node.cardWidth !== 'regular') {
    figureClasses += ` inkling-width-${node.cardWidth}`
  }
  if (node.caption) {
    figureClasses += ' inkling-card-hascaption'
  }

  figure.setAttribute('class', figureClasses)

  const img = document.createElement('img')
  img.setAttribute('src', node.src)
  img.setAttribute('class', 'inkling-image')
  img.setAttribute('alt', node.alt)
  img.setAttribute('loading', 'lazy')

  if (node.title) {
    img.setAttribute('title', node.title)
  }

  if (node.width && node.height) {
    img.setAttribute('width', String(node.width))
    img.setAttribute('height', String(node.height))
  }

  // images can be resized to max width, if that's the case output
  // the resized width/height attrs to ensure 3rd party gallery plugins
  // aren't affected by differing sizes
  const { canTransformImage } = options
  const { defaultMaxWidth } = options.imageOptimization || {}
  if (
    defaultMaxWidth &&
    node.width > defaultMaxWidth &&
    isLocalContentImage(node.src, options.siteUrl) &&
    canTransformImage &&
    canTransformImage(node.src)
  ) {
    const imageDimensions = {
      width: node.width,
      height: node.height,
    }
    const { width, height } = getResizedImageDimensions(imageDimensions, { width: defaultMaxWidth })
    img.setAttribute('width', String(width))
    img.setAttribute('height', String(height))
  }

  if (options.target !== 'email') {
    const imgAttributes = {
      src: node.src,
      width: node.width,
      height: node.height,
    }
    setSrcsetAttribute(img, imgAttributes, options)

    if (img.getAttribute('srcset') && node.width && node.width >= 720) {
      // standard size
      if (!node.cardWidth || node.cardWidth === 'regular') {
        img.setAttribute('sizes', '(min-width: 720px) 720px')
      }

      if (node.cardWidth === 'wide' && node.width >= 1200) {
        img.setAttribute('sizes', '(min-width: 1200px) 1200px')
      }
    }
  }

  // Outlook is unable to properly resize images without a width/height
  // so we add that at the expected size in emails (600px) and use a higher
  // resolution image to keep images looking good on retina screens
  if (options.target === 'email' && node.width && node.height) {
    let imageDimensions = {
      width: node.width,
      height: node.height,
    }
    if (node.width >= 600) {
      imageDimensions = getResizedImageDimensions(imageDimensions, { width: 600 })
    }
    img.setAttribute('width', String(imageDimensions.width))
    img.setAttribute('height', String(imageDimensions.height))

    const contentImageSizes = options.imageOptimization?.contentImageSizes
    if (contentImageSizes && isLocalContentImage(node.src, options.siteUrl) && options.canTransformImage?.(node.src)) {
      // find available image size next up from 2x600 so we can use it for the "retina" src
      const availableImageWidths = getAvailableImageWidths(node, contentImageSizes)
      const srcWidth = availableImageWidths.find((width) => width >= 1200)

      if (!srcWidth || srcWidth === node.width) {
        // do nothing, width is smaller than retina or matches the original node src
      } else {
        const match = node.src.match(/(.*\/content\/images)\/(.*)/)
        if (match) {
          const [, imagesPath, filename] = match
          img.setAttribute('src', `${imagesPath}/size/w${srcWidth}/${filename}`)
        }
      }
    }
  }

  if (node.href) {
    const a = document.createElement('a')
    a.setAttribute('href', node.href)
    a.appendChild(img)
    figure.appendChild(a)
  } else {
    figure.appendChild(img)
  }

  if (node.caption) {
    const caption = document.createElement('figcaption')
    caption.innerHTML = node.caption
    figure.appendChild(caption)
  }

  return { element: figure, type: 'outer' as const }
}
