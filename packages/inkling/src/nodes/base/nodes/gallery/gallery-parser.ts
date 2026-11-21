import type { LexicalNode } from 'lexical'

import { MAX_PER_ROW } from '@kobato/inkling-internal/nodes/base/nodes/gallery/gallery-rows'
import { readCaptionFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-caption-from-element'
import { readImageAttributesFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-image-attributes-from-element'

function readGalleryImageAttributesFromElement(element: HTMLImageElement, imgNum: number) {
  const image = readImageAttributesFromElement(element)

  image.fileName = /[^/]*$/.exec(element.src)![0]
  image.row = Math.floor(imgNum / MAX_PER_ROW)

  return image
}

export function parseGalleryNode(BaseGalleryNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    figure: (nodeElem: HTMLElement) => {
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

            let imgs = Array.from(domNode.querySelectorAll('img'))

            let nextNode = domNode.nextElementSibling
            while (nextNode && isGrafGallery(nextNode)) {
              const currentNode = nextNode
              imgs = imgs.concat(Array.from(currentNode.querySelectorAll('img')))

              const currentNodeCaption = readCaptionFromElement(currentNode)
              if (currentNodeCaption) {
                captions.push(currentNodeCaption)
              }

              nextNode = currentNode.nextElementSibling

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

      function isSqsGallery(node: HTMLElement) {
        return (
          node.tagName === 'DIV' && /sqs-gallery-container/.exec(node.className) && !node.className.includes('summary-')
        )
      }

      if (isSqsGallery(nodeElem)) {
        return {
          conversion(domNode: HTMLElement) {
            const payload: Record<string, unknown> = {}

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
