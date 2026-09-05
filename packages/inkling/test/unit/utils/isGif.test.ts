import { describe, expect, it } from 'vitest'

import { isGif } from '@/utils/isGif'

describe('isGif', () => {
  it('returns true for gif URLs', () => {
    expect(isGif('https://example.com/image.gif')).toBe(true)
    expect(isGif('https://example.com/path/image.gif?size=large')).toBe(true)
  })

  it('returns false for non-gif URLs', () => {
    expect(isGif('https://example.com/image.png')).toBe(false)
    expect(isGif('https://example.com/image.jpg')).toBe(false)
    expect(isGif('https://example.com/no-extension')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isGif('')).toBe(false)
  })
})
