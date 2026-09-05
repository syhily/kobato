import { isLocalContentImage } from '@/nodes/base/utils/content-image-url'

describe('Utils: isLocalContentImage', function () {
  it('returns true for local content image paths', function () {
    expect(isLocalContentImage('/content/images/test.jpg')).toBe(true)
    expect(isLocalContentImage('__INKLING_URL__/content/images/test.jpg')).toBe(true)
  })

  it('returns true when image path is under a site url', function () {
    expect(isLocalContentImage('https://example.com/content/images/test.jpg', 'https://example.com')).toBe(true)
  })

  it('returns false for external images', function () {
    expect(isLocalContentImage('https://example.com/photos/test')).toBe(false)
    expect(isLocalContentImage('https://example.com/other/images/test.jpg')).toBe(false)
  })

  it('handles trailing slash on site url', function () {
    expect(isLocalContentImage('https://example.com/content/images/test.jpg', 'https://example.com/')).toBe(true)
  })

  it('returns true for images served from a separate CDN imageBaseUrl', function () {
    expect(
      isLocalContentImage(
        'https://cdn.example.com/content/images/test.jpg',
        'https://example.com',
        'https://cdn.example.com',
      ),
    ).toBe(true)
  })

  it('handles trailing slash on imageBaseUrl', function () {
    expect(isLocalContentImage('https://cdn.example.com/content/images/test.jpg', '', 'https://cdn.example.com/')).toBe(
      true,
    )
  })

  it('returns false for non-content images on the CDN host', function () {
    expect(isLocalContentImage('https://cdn.example.com/photos/test.jpg', '', 'https://cdn.example.com')).toBe(false)
  })

  it('returns false when imageBaseUrl is not provided', function () {
    expect(isLocalContentImage('https://cdn.example.com/content/images/test.jpg')).toBe(false)
  })
})
