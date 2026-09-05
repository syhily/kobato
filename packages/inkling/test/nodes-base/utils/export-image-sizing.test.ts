import { createRenderContext } from '@/nodes/base/render-context'
import { getExportImageDimensions } from '@/nodes/base/utils/export-image-sizing'
import { getResizedImageDimensions } from '@/nodes/base/utils/get-resized-image-dimensions'

const LOCAL_SRC = '/content/images/2024/04/example.jpg'
const EXTERNAL_SRC = 'https://example.com/images/example.jpg'
const DEFAULT_MAX_WIDTH = 1600

const transformable = () => true

describe('Utils: getExportImageDimensions', function () {
  it('returns null when imageOptimization is absent', function () {
    const context = createRenderContext({ canTransformImage: transformable })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null when defaultMaxWidth is not set', function () {
    const context = createRenderContext({ imageOptimization: {}, canTransformImage: transformable })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null when the intrinsic width equals the max width', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: DEFAULT_MAX_WIDTH, height: 800, context })

    expect(result).toBeNull()
  })

  it('returns null when the intrinsic width is below the max width', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 1200, height: 600, context })

    expect(result).toBeNull()
  })

  it('returns null for an over-wide image whose src is not a local content image', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: EXTERNAL_SRC, width: 2000, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null for an over-wide local image when canTransformImage is absent', function () {
    const context = createRenderContext({ imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH } })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null when canTransformImage rejects the src', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: () => false,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null when the width is null', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: null, height: 1000, context })

    expect(result).toBeNull()
  })

  it('returns null when the height is null', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: null, context })

    expect(result).toBeNull()
  })

  it('shrinks an over-wide local transformable image to the max width', function () {
    const context = createRenderContext({
      imageOptimization: { defaultMaxWidth: DEFAULT_MAX_WIDTH },
      canTransformImage: transformable,
    })
    const result = getExportImageDimensions({ src: LOCAL_SRC, width: 2000, height: 1000, context })

    expect(result).toEqual(getResizedImageDimensions({ width: 2000, height: 1000 }, { width: DEFAULT_MAX_WIDTH }))
    expect(result).toEqual({ width: 1600, height: 800 })
  })
})
