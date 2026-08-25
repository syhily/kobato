import { describe, expect, it } from 'vitest'

import { getImageSrcset, getImageUrl, isTransformableRemoteImage, siteOwnedStorageSrc } from '@/shared/types/images'

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

describe('shared/images — site-owned transform intent (w/h/q params)', () => {
  const assetHost = 'assets.example.com'
  const siteOrigin = 'https://blog.example.com'
  const template = 'https://cdn.transform.com/{src}?w={width}&h={height}&q={quality}'

  it('appends w/h/q to an origin-relative /storage/ src', () => {
    expect(
      getImageUrl({
        src: '/storage/images/a.jpg',
        width: 300,
        height: 150,
        quality: 75,
        assetHost,
        urlTemplate: template,
        siteOrigin,
      }),
    ).toBe('/storage/images/a.jpg?w=300&h=150&q=75')
  })

  it('omits q when quality is not given', () => {
    expect(
      getImageUrl({
        src: '/storage/images/a.jpg?v=123',
        width: 300,
        height: 150,
        assetHost,
        urlTemplate: template,
        siteOrigin,
      }),
    ).toBe('/storage/images/a.jpg?v=123&w=300&h=150')
  })

  it('recognizes absolute same-origin storage URLs', () => {
    expect(
      getImageUrl({
        src: 'https://blog.example.com/storage/images/a.jpg',
        width: 640,
        height: 360,
        assetHost,
        urlTemplate: template,
        siteOrigin,
      }),
    ).toBe('https://blog.example.com/storage/images/a.jpg?w=640&h=360')
  })

  it('serves the plain URL when no template is configured', () => {
    expect(
      getImageUrl({ src: '/storage/images/a.jpg', width: 300, height: 150, assetHost, urlTemplate: '', siteOrigin }),
    ).toBe('/storage/images/a.jpg')
  })

  it('keeps the legacy inline-template path for external URLs', () => {
    const src = 'https://assets.example.com/image.jpg'
    expect(
      getImageUrl({ src, width: 300, height: 150, assetHost, urlTemplate: '!both/{width}x{height}', siteOrigin }),
    ).toBe('https://assets.example.com/image.jpg!both/300x150')
  })

  it('emits per-breakpoint param URLs in the site-owned srcset', () => {
    const srcset = getImageSrcset({
      src: '/storage/images/a.jpg',
      width: 800,
      height: 400,
      assetHost,
      urlTemplate: template,
      siteOrigin,
      breakpoints: [256, 512],
    })
    expect(srcset).toBe('/storage/images/a.jpg?w=256&h=128 256w, /storage/images/a.jpg?w=512&h=256 512w')
  })

  it('emits an empty srcset for site-owned URLs without a template', () => {
    expect(
      getImageSrcset({ src: '/storage/images/a.jpg', width: 800, height: 400, assetHost, urlTemplate: '', siteOrigin }),
    ).toBe('')
  })
})

describe('shared/images — siteOwnedStorageSrc', () => {
  it('accepts the origin-relative form regardless of siteOrigin', () => {
    expect(siteOwnedStorageSrc('/storage/images/a.jpg', undefined)).toBe('/storage/images/a.jpg')
  })

  it('accepts an absolute URL on the site origin', () => {
    expect(siteOwnedStorageSrc('https://blog.example.com/storage/images/a.jpg', 'https://blog.example.com')).toBe(
      'https://blog.example.com/storage/images/a.jpg',
    )
  })

  it('rejects external and non-storage paths', () => {
    expect(siteOwnedStorageSrc('https://other.com/storage/a.jpg', 'https://blog.example.com')).toBeNull()
    expect(siteOwnedStorageSrc('https://blog.example.com/images/og/x.png', 'https://blog.example.com')).toBeNull()
    expect(siteOwnedStorageSrc('data:image/png;base64,abc', 'https://blog.example.com')).toBeNull()
  })
})
