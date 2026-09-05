import { describe, expect, it, vi } from 'vitest'

import {
  headerHexColor,
  matchingHeaderTextColor,
  mergeWhiteColor,
  resolveHeaderImageTextColor,
} from '@/nodes/header/header-accent-color'
import { getAccentColor } from '@/utils/getAccentColor'

vi.mock('@/utils/getAccentColor', () => ({
  getAccentColor: vi.fn(() => ' #3366cc '),
}))

vi.mock('fast-average-color', () => ({
  // `new FastAverageColor()` — the mock must be constructable, so a plain
  // function (arrow functions are not constructors)
  FastAverageColor: vi.fn().mockImplementation(function () {
    return {
      getColorAsync: async (src: string) => {
        if (src.includes('broken')) {
          throw new Error('cannot average')
        }
        if (src.includes('transparent')) {
          return { value: [200, 100, 50, 128] }
        }
        return { value: [0, 0, 0, 255] }
      },
    }
  }),
}))

describe('headerHexColor', () => {
  it('resolves the accent keyword through the host accent color', () => {
    expect(headerHexColor('accent')).toBe('#3366cc')
    expect(getAccentColor).toHaveBeenCalled()
  })

  it('passes other colors through trimmed', () => {
    expect(headerHexColor('  #ff0000 ')).toBe('#ff0000')
  })
})

describe('matchingHeaderTextColor', () => {
  it('matches nothing for transparent', () => {
    expect(matchingHeaderTextColor('transparent')).toBe('')
  })

  it('picks a readable counterpart for a color', () => {
    // white background reads as dark text, black as light text
    expect(matchingHeaderTextColor('#ffffff')).toBe('#000000')
    expect(matchingHeaderTextColor('#000000')).toBe('#FFFFFF')
  })
})

describe('mergeWhiteColor', () => {
  it('keeps a fully opaque color unchanged', () => {
    expect(mergeWhiteColor({ r: 10, g: 20, b: 30, a: 255 })).toBe('#0A141E')
  })

  it('merges a fully transparent color to white', () => {
    expect(mergeWhiteColor({ r: 0, g: 0, b: 0, a: 0 })).toBe('#FFFFFF')
  })

  it('blends a semi-transparent color over white', () => {
    // ~50% black over white → #7F7F7F
    expect(mergeWhiteColor({ r: 0, g: 0, b: 0, a: 128 })).toBe('#7F7F7F')
  })
})

describe('resolveHeaderImageTextColor', () => {
  it('averages the image and matches the text color', async () => {
    // opaque black average → white text
    await expect(resolveHeaderImageTextColor('https://example.com/bg.png', 'regular')).resolves.toBe('#FFFFFF')
  })

  it('merges a transparent image over white before matching', async () => {
    // semi-transparent (128/255 ≈ 0.5) (200,100,50) over white ≈ #E3B198 —
    // the merge ran (the raw average would be #C86432); the matching policy
    // picks white for the merged color either way
    await expect(resolveHeaderImageTextColor('https://example.com/transparent.png', 'wide')).resolves.toBe('#FFFFFF')
  })

  it.each([
    ['no src', undefined, 'regular'],
    ['the split layout', 'https://example.com/bg.png', 'split'],
    ['an image that fails to average', 'https://example.com/broken.png', 'regular'],
  ])('returns null for %s', async (_label, src, layout) => {
    await expect(resolveHeaderImageTextColor(src, layout)).resolves.toBeNull()
  })
})
