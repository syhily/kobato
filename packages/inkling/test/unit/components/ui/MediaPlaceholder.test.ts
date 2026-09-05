import { describe, expect, it } from 'vitest'

import { isPlaceholderIconName } from '@/components/ui/MediaPlaceholder'

describe('isPlaceholderIconName', () => {
  it('accepts declared icon names', () => {
    expect(isPlaceholderIconName('file')).toBe(true)
  })

  it('rejects prototype-chain keys that an `in` guard would let through', () => {
    // 'constructor'/'toString' resolve via Object.prototype with `in`, and
    // rendering them crashes React ("element type is invalid")
    expect(isPlaceholderIconName('constructor')).toBe(false)
    expect(isPlaceholderIconName('toString')).toBe(false)
  })

  it('rejects non-strings and undeclared names', () => {
    expect(isPlaceholderIconName(undefined)).toBe(false)
    expect(isPlaceholderIconName(42)).toBe(false)
    expect(isPlaceholderIconName('no-such-icon')).toBe(false)
  })
})
