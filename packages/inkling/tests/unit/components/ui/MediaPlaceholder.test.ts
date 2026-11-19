import { isPlaceholderIconName } from '@kobato/inkling-internal/components/ui/MediaPlaceholder'
import { describe, expect, it } from 'vitest'

describe('isPlaceholderIconName', () => {
  it('accepts declared icon names', () => {
    expect(isPlaceholderIconName('file')).toBe(true)
  })

  it('rejects prototype-chain keys that an `in` guard would let through', () => {
    expect(isPlaceholderIconName('constructor')).toBe(false)
    expect(isPlaceholderIconName('toString')).toBe(false)
  })

  it('rejects non-strings and undeclared names', () => {
    expect(isPlaceholderIconName(undefined)).toBe(false)
    expect(isPlaceholderIconName(42)).toBe(false)
    expect(isPlaceholderIconName('no-such-icon')).toBe(false)
  })
})
