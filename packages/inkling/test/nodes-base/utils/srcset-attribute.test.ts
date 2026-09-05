import { createRenderContext } from '@/nodes/base/render-context'
import { getSrcsetAttribute } from '@/nodes/base/utils/srcset-attribute'

const options = {
  imageOptimization: {
    contentImageSizes: {
      s: { width: 600 },
      m: { width: 1000 },
      l: { width: 1600 },
    },
  },
}

const context = createRenderContext(options)

describe('srcsetAttribute', function () {
  it('returns undefined when a local image path does not match the content/images capture pattern', function () {
    const result = getSrcsetAttribute({
      src: '/xcontent/images/2024/04/example.jpg',
      width: 1200,
      context,
    })

    expect(result).toBeUndefined()
  })

  it('adds /format/<format>/ to every srcset entry when a format is requested', function () {
    const result = getSrcsetAttribute({
      src: '/content/images/2024/04/example.jpg',
      width: 1200,
      context,
      format: 'webp',
    })

    expect(result).toBe(
      '/content/images/size/w600/format/webp/2024/04/example.jpg 600w, /content/images/size/w1000/format/webp/2024/04/example.jpg 1000w, /content/images/size/w1200/format/webp/2024/04/example.jpg 1200w',
    )
  })

  it('uses the sized format path instead of the original src when width matches exactly', function () {
    const result = getSrcsetAttribute({
      src: '/content/images/2024/04/example.jpg',
      width: 600,
      context,
      format: 'avif',
    })

    expect(result).toBe('/content/images/size/w600/format/avif/2024/04/example.jpg 600w')
  })

  it('keeps the original src for an exact width match when no format is requested', function () {
    const result = getSrcsetAttribute({
      src: '/content/images/2024/04/example.jpg',
      width: 600,
      context,
    })

    expect(result).toBe('/content/images/2024/04/example.jpg 600w')
  })

  it('treats CDN images as content images when imageBaseUrl is provided', function () {
    const result = getSrcsetAttribute({
      src: 'https://cdn.example.com/content/images/2024/04/example.jpg',
      width: 1200,
      context: createRenderContext({ ...options, imageBaseUrl: 'https://cdn.example.com' }),
    })

    expect(result).toBe(
      'https://cdn.example.com/content/images/size/w600/2024/04/example.jpg 600w, https://cdn.example.com/content/images/size/w1000/2024/04/example.jpg 1000w, https://cdn.example.com/content/images/2024/04/example.jpg 1200w',
    )
  })
})
