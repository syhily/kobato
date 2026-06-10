import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { ImageNodeView } from '@/ui/admin/editor/tiptap/ImageNodeView'

export const ImageNode = Image.extend({
  draggable: true,
  addAttributes() {
    const parent = this.parent?.() ?? {}
    return {
      ...parent,
      _key: { default: '' },
      caption: { default: undefined },
      width: {
        default: undefined,
        parseHTML(element) {
          const value = element.getAttribute('width')
          if (value === null) {
            return undefined
          }
          const parsed = Number.parseInt(value, 10)
          return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
        },
        renderHTML(attrs) {
          const width = typeof attrs.width === 'number' ? attrs.width : undefined
          return width === undefined ? {} : { width }
        },
      },
      height: {
        default: undefined,
        parseHTML(element) {
          const value = element.getAttribute('height')
          if (value === null) {
            return undefined
          }
          const parsed = Number.parseInt(value, 10)
          return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
        },
        renderHTML(attrs) {
          const height = typeof attrs.height === 'number' ? attrs.height : undefined
          return height === undefined ? {} : { height }
        },
      },
      thumbhash: { default: undefined },
      storagePath: { default: undefined },
      imageId: { default: undefined },
      layout: { default: undefined },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView, {
      className:
        '!text-ink-2 [&_[data-slot=input]]:!bg-background [&_[data-slot=input]]:!text-ink-2 [&_[data-slot=input]]:!caret-ink-2',
    })
  },
})
