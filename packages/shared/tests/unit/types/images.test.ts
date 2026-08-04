import { getImageUrl, isTransformableRemoteImage } from '@kobato/shared/types/images'
import { describe, expect, it } from 'vitest'

describe('shared/images — getImageUrl', () => {
  const assetHost = 'assets.example.com'

  it('returns src unchanged when the host does not match', () => {
    const src = 'https://other.cdn.com/image.jpg'
    expect(
      getImageUrl({
        src,
        width: 300,
        height: 300,
        assetHost,
        urlTemplate: '!upyun520/both/{width}x{height}',
      }),
    ).toBe(src)
  })

  it('returns src unchanged when the template is empty', () => {
    const src = 'https://assets.example.com/image.jpg'
    expect(getImageUrl({ src, width: 300, height: 300, assetHost, urlTemplate: '' })).toBe(src)
  })

  it('appends the template to the src path', () => {
    const src = 'https://assets.example.com/image.jpg'
    const result = getImageUrl({
      src,
      width: 300,
      height: 300,
      quality: 80,
      assetHost,
      urlTemplate: '!upyun520/both/{width}x{height}/format/webp/quality/{quality}',
    })
    expect(result).toBe('https://assets.example.com/image.jpg!upyun520/both/300x300/format/webp/quality/80')
  })

  it('moves query params to the end when there is no {src} placeholder', () => {
    const src = 'https://assets.example.com/image.jpg?v=1778083370885'
    const result = getImageUrl({
      src,
      width: 300,
      height: 300,
      quality: 80,
      assetHost,
      urlTemplate: '!upyun520/both/{width}x{height}',
    })
    expect(result).toBe('https://assets.example.com/image.jpg!upyun520/both/300x300?v=1778083370885')
  })

  it('moves query params to the end when the template contains {src}', () => {
    const src = 'https://assets.example.com/image.jpg?v=1778083370885'
    const result = getImageUrl({
      src,
      width: 300,
      height: 300,
      assetHost,
      urlTemplate: 'https://wsrv.nl/?url={src}&w={width}',
    })
    expect(result).toBe('https://wsrv.nl/?url=https://assets.example.com/image.jpg&w=300&v=1778083370885')
  })

  it('uses & instead of ? when the rendered template already has a query string', () => {
    const src = 'https://assets.example.com/image.jpg?v=123'
    const result = getImageUrl({
      src,
      width: 300,
      height: 300,
      assetHost,
      urlTemplate: 'https://wsrv.nl/?url={src}&w={width}',
    })
    expect(result).toBe('https://wsrv.nl/?url=https://assets.example.com/image.jpg&w=300&v=123')
  })

  it('preserves multiple query params from src', () => {
    const src = 'https://assets.example.com/image.jpg?v=123&foo=bar'
    const result = getImageUrl({
      src,
      width: 300,
      height: 300,
      assetHost,
      urlTemplate: '!upyun520/both/{width}x{height}',
    })
    expect(result).toBe('https://assets.example.com/image.jpg!upyun520/both/300x300?v=123&foo=bar')
  })
})

describe('shared/images — isTransformableRemoteImage', () => {
  it('returns false for data URLs', () => {
    expect(isTransformableRemoteImage('data:image/png;base64,abc', 'assets.example.com')).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(isTransformableRemoteImage('not-a-url', 'assets.example.com')).toBe(false)
  })

  it('returns true for matching host', () => {
    expect(isTransformableRemoteImage('https://assets.example.com/image.jpg', 'assets.example.com')).toBe(true)
  })

  it('returns false for mismatched host', () => {
    expect(isTransformableRemoteImage('https://other.com/image.jpg', 'assets.example.com')).toBe(false)
  })
})
