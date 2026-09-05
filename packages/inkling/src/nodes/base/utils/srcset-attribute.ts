import type { RenderContext } from '@/nodes/base/render-context'

import { CONTENT_IMAGE_PATH_REGEX } from '@/nodes/base/utils/content-image-url'
import { getAvailableImageWidths } from '@/nodes/base/utils/get-available-image-widths'

// default content sizes: [600, 1000, 1600, 2400]

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

  // The local-content check reads siteUrl/imageBaseUrl from the context, so
  // callers can't drop the forwarding (the b87ecc1 bug class).
  if (context.isLocalContentImage(src) && context.canTransformImage && !context.canTransformImage(src)) {
    return
  }

  const srcsetWidths = getAvailableImageWidths({ width }, imageOptimization.contentImageSizes)

  // apply srcset if this is a relative image that matches Inkling's image url structure
  if (context.isLocalContentImage(src)) {
    const match = src.match(CONTENT_IMAGE_PATH_REGEX)
    if (!match) {
      return
    }

    const [, imagesPath, filename] = match
    const srcs: string[] = []

    srcsetWidths.forEach((srcsetWidth) => {
      if (srcsetWidth === width) {
        // use original image path if width matches exactly (avoids 302s from size->original)
        // unless a specific output format was requested
        if (format) {
          srcs.push(`${imagesPath}/size/w${srcsetWidth}/format/${format}/${filename} ${srcsetWidth}w`)
        } else {
          srcs.push(`${src} ${srcsetWidth}w`)
        }
      } else if (srcsetWidth <= width) {
        // avoid creating srcset sizes larger than intrinsic image width
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
  // both call sites (image-renderer, gallery-renderer) pass an <img>; a
  // <source> in picture context carries srcset, not src, so the guard
  // narrows to IMG only
  if (!elem || elem.tagName !== 'IMG' || !elem.getAttribute('src')) {
    return
  }

  const { src, width } = image
  const srcset = getSrcsetAttribute({ src, width, context })

  if (srcset) {
    elem.setAttribute('srcset', srcset)
  }
}
