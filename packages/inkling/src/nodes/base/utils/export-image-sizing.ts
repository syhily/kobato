import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

import { getResizedImageDimensions } from '@kobato/inkling-internal/nodes/base/utils/get-resized-image-dimensions'

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
  const { canTransformImage } = context
  const { defaultMaxWidth } = context.imageOptimization || {}
  if (
    defaultMaxWidth &&
    width !== null &&
    height !== null &&
    width > defaultMaxWidth &&
    context.isLocalContentImage(src) &&
    canTransformImage?.(src)
  ) {
    return getResizedImageDimensions({ width, height }, { width: defaultMaxWidth })
  }

  return null
}
