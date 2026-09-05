import type { RenderContext } from '@/nodes/base/render-context'

import { appendCardCaption } from '@/nodes/base/utils/append-card-caption'
import { getExportImageDimensions } from '@/nodes/base/utils/export-image-sizing'
import { isSafeRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'
import { getSrcsetAttribute, setSrcsetAttribute } from '@/nodes/base/utils/srcset-attribute'

const MODERN_IMAGE_FORMATS = ['avif', 'webp']

function isAnimatedImage(url = '') {
  try {
    const parsedUrl = new URL(url, 'http://localhost')
    return parsedUrl.pathname.toLowerCase().endsWith('.gif')
  } catch {
    return false
  }
}

interface ImageNodeData {
  src: string
  width: number | null
  height: number | null
  alt: string
  title: string
  caption: string
  cardWidth: string
  href: string
}

export function renderImageNode(node: ImageNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!isSafeRenderableSource(context, 'media', node.src)) {
    return renderEmptyContainer(document)
  }

  const figure = document.createElement('figure')

  let figureClasses = 'inkling-card inkling-image-card'
  if (node.cardWidth !== 'regular') {
    figureClasses += ` inkling-width-${node.cardWidth}`
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

  const resizedDimensions = getExportImageDimensions({
    src: node.src,
    width: node.width,
    height: node.height,
    context,
  })
  if (resizedDimensions) {
    img.setAttribute('width', String(resizedDimensions.width))
    img.setAttribute('height', String(resizedDimensions.height))
  }

  let picture: HTMLPictureElement | null = null

  // a null width yields no srcset below, so skip the call outright
  if (node.width !== null) {
    const imgAttributes = {
      src: node.src,
      width: node.width,
      height: node.height,
    }
    setSrcsetAttribute(img, imgAttributes, context)
  }

  let sizes: string | undefined
  if (img.getAttribute('srcset') && node.width && node.width >= 720) {
    // standard size
    if (!node.cardWidth || node.cardWidth === 'regular') {
      sizes = '(min-width: 720px) 720px'
    }

    if (node.cardWidth === 'wide' && node.width >= 1200) {
      sizes = '(min-width: 1200px) 1200px'
    }
  }

  if (sizes) {
    img.setAttribute('sizes', sizes)
  }

  const shouldRenderPicture = Boolean(
    context.pictureImageFormats &&
    img.getAttribute('srcset') &&
    !isAnimatedImage(node.src) &&
    context.isLocalContentImage(node.src) &&
    context.canTransformImage?.(node.src) &&
    typeof context.canTransformImageToFormat === 'function',
  )

  if (shouldRenderPicture) {
    // const-aliased so the closure below keeps the narrowing
    // shouldRenderPicture established (its typeof check covers both)
    const canTransformImageToFormat = context.canTransformImageToFormat
    const pictureElement = document.createElement('picture')
    let sourcesAdded = false

    MODERN_IMAGE_FORMATS.forEach((format) => {
      // a null width yields no srcset from getSrcsetAttribute — skip early
      if (node.width === null) {
        return
      }

      if (!canTransformImageToFormat?.(format)) {
        return
      }

      const formattedSrcset = getSrcsetAttribute({
        src: node.src,
        width: node.width,
        context,
        format,
      })

      if (!formattedSrcset) {
        return
      }

      const source = document.createElement('source')
      source.setAttribute('srcset', formattedSrcset)
      source.setAttribute('type', `image/${format}`)

      if (sizes) {
        source.setAttribute('sizes', sizes)
      }

      pictureElement.appendChild(source)
      sourcesAdded = true
    })

    if (sourcesAdded) {
      pictureElement.appendChild(img)
      picture = pictureElement
    } else {
      picture = null
    }
  }

  const href = context.safeUrl('navigation', node.href)
  if (href) {
    const a = document.createElement('a')
    a.setAttribute('href', href)
    a.appendChild(picture || img)
    figure.appendChild(a)
  } else {
    figure.appendChild(picture || img)
  }

  if (node.caption) {
    appendCardCaption(figure, node.caption, context)
  }

  return { element: figure, type: 'outer' as const }
}
