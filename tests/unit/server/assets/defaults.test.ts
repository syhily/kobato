import { describe, expect, it } from 'vitest'

import { DEFAULT_BINARY, DEFAULT_SVG } from '@/server/assets/defaults'
import { generateFaviconPack } from '@/server/domains/assets/generate'

describe('generateFaviconPack', () => {
  it('generates a favicon pack from a valid SVG', async () => {
    const pack = await generateFaviconPack(DEFAULT_SVG.faviconSvg)

    expect(pack.faviconIco.length).toBeGreaterThan(0)
    expect(pack.appleTouchIcon.length).toBeGreaterThan(0)
    expect(pack.icon192.length).toBeGreaterThan(0)
    expect(pack.icon512.length).toBeGreaterThan(0)
  })

  it('produces PNG buffers of expected dimensions', async () => {
    const pack = await generateFaviconPack(DEFAULT_SVG.faviconSvg)

    const sharp = await import('sharp')
    const [meta512, meta192, metaApple] = await Promise.all([
      sharp.default(pack.icon512).metadata(),
      sharp.default(pack.icon192).metadata(),
      sharp.default(pack.appleTouchIcon).metadata(),
    ])

    expect(meta512.width).toBe(512)
    expect(meta512.height).toBe(512)
    expect(meta192.width).toBe(192)
    expect(meta192.height).toBe(192)
    expect(metaApple.width).toBe(180)
    expect(metaApple.height).toBe(180)
  })

  it('produces a valid ICO buffer', async () => {
    const pack = await generateFaviconPack(DEFAULT_SVG.faviconSvg)

    // ICO header: reserved (0x0000), type (0x0001 = ICO), count
    expect(pack.faviconIco[0]).toBe(0x00)
    expect(pack.faviconIco[1]).toBe(0x00)
    expect(pack.faviconIco[2]).toBe(0x01)
    expect(pack.faviconIco[3]).toBe(0x00)
    const imageCount = pack.faviconIco[4]
    expect(imageCount).toBeGreaterThanOrEqual(1)
  })
})

describe('DEFAULT_BINARY', () => {
  it('inlines every default binary asset as a non-empty Buffer', () => {
    for (const [key, buffer] of Object.entries(DEFAULT_BINARY)) {
      expect(buffer, `DEFAULT_BINARY.${key}`).toBeInstanceOf(Buffer)
      expect((buffer as Buffer).length, `DEFAULT_BINARY.${key}`).toBeGreaterThan(0)
    }
  })

  it('covers every expected binary slot', () => {
    const expected = [
      'faviconIco',
      'appleTouchIcon',
      'icon192',
      'icon512',
      'openGraph',
      'blogPoster',
      'blogPosterDark',
      'defaultAvatar',
      'defaultMusicCover',
    ]
    expect(Object.keys(DEFAULT_BINARY).sort()).toEqual(expected.sort())
  })
})
