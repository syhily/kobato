import type { RenderContext } from '@/nodes/base/render-context'
import type { GalleryImage } from '@/types/gallery'

import { buildGalleryRows } from '@/nodes/base/nodes/gallery/gallery-rows'
import { appendCardCaption } from '@/nodes/base/utils/append-card-caption'
import { getExportImageDimensions } from '@/nodes/base/utils/export-image-sizing'
import { renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'
import { setSrcsetAttribute } from '@/nodes/base/utils/srcset-attribute'

// the renderer can only lay out images that carry these fields; isValidImage
// narrows the canonical (all-optional) GalleryImage to this stricter view
interface ValidGalleryImage extends GalleryImage {
  fileName: string
  src: string
  width: number
  height: number
  row: number
}

interface GalleryNodeData {
  images: GalleryImage[]
  caption: string
}

function isValidImage(image: unknown, context: RenderContext): image is ValidGalleryImage {
  if (typeof image !== 'object' || image === null) {
    return false
  }

  const candidate = image as Partial<ValidGalleryImage>
  const width = candidate.width
  const height = candidate.height
  const row = candidate.row

  // the predicate vouches for the whole ValidGalleryImage shape, so the
  // optional string fields must be string-or-absent too, not just present-or-not
  const optionalStringsValid = (['alt', 'title', 'href', 'caption', 'previewSrc'] as const).every(
    (key) => candidate[key] === undefined || typeof candidate[key] === 'string',
  )

  return (
    optionalStringsValid &&
    typeof candidate.fileName === 'string' &&
    candidate.fileName.trim() !== '' &&
    typeof candidate.src === 'string' &&
    context.safeUrl('media', candidate.src) !== '' &&
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0 &&
    typeof row === 'number' &&
    Number.isInteger(row) &&
    row >= 0
  )
}

export function renderGalleryNode(node: GalleryNodeData, context: RenderContext) {
  const document = context.createDocument()

  const validImages = node.images.filter((image): image is ValidGalleryImage => isValidImage(image, context))
  if (!validImages.length) {
    return renderEmptyContainer(document)
  }

  const figure = document.createElement('figure')
  figure.setAttribute('class', 'inkling-card inkling-gallery-card inkling-width-wide')

  const container = document.createElement('div')
  container.setAttribute('class', 'inkling-gallery-container')
  figure.appendChild(container)

  const rows = buildGalleryRows(validImages)

  rows.forEach((row) => {
    const rowDiv = document.createElement('div')
    rowDiv.setAttribute('class', 'inkling-gallery-row')

    row.forEach((image: ValidGalleryImage) => {
      const imgDiv = document.createElement('div')
      imgDiv.setAttribute('class', 'inkling-gallery-image')

      const img = document.createElement('img')
      img.setAttribute('src', image.src)
      img.setAttribute('width', String(image.width))
      img.setAttribute('height', String(image.height))
      img.setAttribute('loading', 'lazy')
      img.setAttribute('alt', image.alt || '')
      if (image.title) {
        img.setAttribute('title', image.title)
      }

      const resizedDimensions = getExportImageDimensions({
        src: image.src,
        width: image.width,
        height: image.height,
        context,
      })
      if (resizedDimensions) {
        img.setAttribute('width', String(resizedDimensions.width))
        img.setAttribute('height', String(resizedDimensions.height))
      }

      // add srcset+sizes
      setSrcsetAttribute(img, image, context)

      if (img.getAttribute('srcset') && image.width >= 720) {
        if (rows.length === 1 && row.length === 1 && image.width >= 1200) {
          img.setAttribute('sizes', '(min-width: 1200px) 1200px')
        } else {
          img.setAttribute('sizes', '(min-width: 720px) 720px')
        }
      }

      const safeHref = context.safeUrl('navigation', image.href || '')
      if (safeHref) {
        const a = document.createElement('a')
        a.setAttribute('href', safeHref)
        a.appendChild(img)
        imgDiv.appendChild(a)
      } else {
        imgDiv.appendChild(img)
      }
      rowDiv.appendChild(imgDiv)
    })

    container.appendChild(rowDiv)
  })

  if (node.caption) {
    appendCardCaption(figure, node.caption, context)
  }

  return { element: figure, type: 'outer' as const }
}
