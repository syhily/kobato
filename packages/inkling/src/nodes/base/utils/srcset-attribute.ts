import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import { CONTENT_IMAGE_PATH_REGEX } from '@kobato/inkling-internal/nodes/base/utils/content-image-url'
import { getAvailableImageWidths } from '@kobato/inkling-internal/nodes/base/utils/get-available-image-widths'

export const getSrcsetAttribute = function ({
  src,
  width,
  context,
  format,
}: {
  src: string
  width: number
  context: RenderContext
  format?: string
}) {
  const { imageOptimization } = context
  if (!imageOptimization || imageOptimization.srcsets === false || !width || !imageOptimization.contentImageSizes) {
    return
  }

  if (context.isLocalContentImage(src) && context.canTransformImage && !context.canTransformImage(src)) {
    return
  }

  const srcsetWidths = getAvailableImageWidths({ width }, imageOptimization.contentImageSizes)

  if (context.isLocalContentImage(src)) {
    const match = src.match(CONTENT_IMAGE_PATH_REGEX)
    if (!match) {
      return
    }

    const [, imagesPath, filename] = match
    const srcs: string[] = []

    srcsetWidths.forEach((srcsetWidth) => {
      if (srcsetWidth === width) {
        if (format) {
          srcs.push(`${imagesPath}/size/w${srcsetWidth}/format/${format}/${filename} ${srcsetWidth}w`)
        } else {
          srcs.push(`${src} ${srcsetWidth}w`)
        }
      } else if (srcsetWidth <= width) {
        if (format) {
          srcs.push(`${imagesPath}/size/w${srcsetWidth}/format/${format}/${filename} ${srcsetWidth}w`)
        } else {
          srcs.push(`${imagesPath}/size/w${srcsetWidth}/${filename} ${srcsetWidth}w`)
        }
      }
    })

    if (srcs.length) {
      return srcs.join(', ')
    }
  }
}

export const setSrcsetAttribute = function (
  elem: Element | null,
  image: { src: string; width: number },
  context: RenderContext,
) {
  if (elem?.tagName !== 'IMG' || !elem.getAttribute('src')) {
    return
  }

  const { src, width } = image
  const srcset = getSrcsetAttribute({ src, width, context })

  if (srcset) {
    elem.setAttribute('srcset', srcset)
  }
}
