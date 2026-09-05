// Survives hand-written (no import spec, CONTEXT.md: "import spec"): the
// `images` collection property, sibling walking with node removal, and the
// SQS branch's DOM mutation are structural, not flat per-property reads.
import type { LexicalNode } from 'lexical'

// MAX_PER_ROW comes straight from its canonical home — importing it via
// GalleryNode would close a GalleryNode → parser → GalleryNode import cycle
import { MAX_PER_ROW } from '@/nodes/base/nodes/gallery/gallery-rows'
import { readCaptionFromElement } from '@/nodes/base/utils/read-caption-from-element'
import { readImageAttributesFromElement } from '@/nodes/base/utils/read-image-attributes-from-element'

function readGalleryImageAttributesFromElement(element: HTMLImageElement, imgNum: number) {
  const image = readImageAttributesFromElement(element)

  image.fileName = element.src.match(/[^/]*$/)![0]
  image.row = Math.floor(imgNum / MAX_PER_ROW)

  return image
}

export function parseGalleryNode(BaseGalleryNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    figure: (nodeElem: HTMLElement) => {
      // Inkling gallery card
      if (nodeElem.classList.contains('inkling-gallery-card')) {
        return {
          conversion(domNode: HTMLElement) {
            const payload: Record<string, unknown> = {}
            const imgs = Array.from(domNode.querySelectorAll('img'))

            payload.images = imgs.map(readGalleryImageAttributesFromElement)
            payload.caption = readCaptionFromElement(domNode)

            const node = new BaseGalleryNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }

      return null
    },
    div: (nodeElem: HTMLElement) => {
      // Medium "graf" galleries
      function isGrafGallery(node: Element) {
        return (
          node.tagName === 'DIV' && node.getAttribute('data-paragraph-count') && node.querySelectorAll('img').length > 0
        )
      }

      if (isGrafGallery(nodeElem)) {
        return {
          conversion(domNode: HTMLElement) {
            const payload: Record<string, unknown> = {}
            const captions = [readCaptionFromElement(domNode)].filter((caption): caption is string => Boolean(caption))

            // These galleries exist as a series of divs containing multiple figure+img.
            // Grab the first set of imgs...
            let imgs = Array.from(domNode.querySelectorAll('img'))

            // ...and then iterate over any remaining divs until we run out of matches
            let nextNode = domNode.nextElementSibling
            while (nextNode && isGrafGallery(nextNode)) {
              const currentNode = nextNode
              imgs = imgs.concat(Array.from(currentNode.querySelectorAll('img')))

              const currentNodeCaption = readCaptionFromElement(currentNode)
              if (currentNodeCaption) {
                captions.push(currentNodeCaption)
              }

              nextNode = currentNode.nextElementSibling

              // remove nodes as we go so that they don't go through the parser
              currentNode.remove()
            }

            if (captions.length > 0) {
              payload.caption = captions.join(' / ')
            }

            payload.images = imgs.map(readGalleryImageAttributesFromElement)

            const node = new BaseGalleryNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }

      // Squarespace SQS galleries
      function isSqsGallery(node: HTMLElement) {
        return (
          node.tagName === 'DIV' && node.className.match(/sqs-gallery-container/) && !node.className.match(/summary-/)
        )
      }

      if (isSqsGallery(nodeElem)) {
        return {
          conversion(domNode: HTMLElement) {
            const payload: Record<string, unknown> = {}

            // Each image exists twice...
            // The first image is wrapped in `<noscript>`
            // The second image contains image dimensions but the src property needs to be taken from `data-src`.
            let imgs: HTMLImageElement[] = Array.from(domNode.querySelectorAll('img.thumb-image'))

            imgs = imgs
              .map((img) => {
                if (!img.getAttribute('src')) {
                  if (
                    img.previousElementSibling?.tagName === 'NOSCRIPT' &&
                    img.previousElementSibling.getElementsByTagName('img').length
                  ) {
                    const prevNode = img.previousElementSibling
                    img.setAttribute('src', img.getAttribute('data-src') ?? '')
                    prevNode.remove()
                  } else {
                    return undefined
                  }
                }

                return img
              })
              .filter((img) => img !== undefined)

            // Process nodes into the payload
            payload.images = imgs.map(readGalleryImageAttributesFromElement)

            payload.caption = readCaptionFromElement(domNode, { selector: '.meta-title' })

            const node = new BaseGalleryNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }

      return null
    },
  }
}
