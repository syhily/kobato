import type { RenderContext } from '@/nodes/base/render-context'

import { getResizedImageDimensions } from '@/nodes/base/utils/get-resized-image-dimensions'

/**
 * The export-time max-width policy for emitted image width/height attrs,
 * shared by the image and gallery card renderers. Returns the resized
 * dimensions when the policy applies, `null` when the intrinsic dims stay.
 * Null width/height (the image card's unmeasured case) always yields `null`.
 */
export const getExportImageDimensions = function ({
  src,
  width,
  height,
  context,
}: {
  src: string
  width: number | null
  height: number | null
  context: RenderContext
}): { width: number; height: number } | null {
  // images can be resized to max width, if that's the case output
  // the resized width/height attrs to ensure 3rd party gallery plugins
  // aren't affected by differing sizes
  const { canTransformImage } = context
  const { defaultMaxWidth } = context.imageOptimization || {}
  if (
    defaultMaxWidth &&
    width !== null &&
    height !== null &&
    width > defaultMaxWidth &&
    context.isLocalContentImage(src) &&
    canTransformImage &&
    canTransformImage(src)
  ) {
    return getResizedImageDimensions({ width, height }, { width: defaultMaxWidth })
  }

  return null
}
