import { safeRel } from '@kobato/shared/safe-rel'
import { describe, expect, it } from 'vitest'

describe('safeRel', () => {
  it('returns existing rel when target is not _blank', () => {
    expect(safeRel(undefined, 'nofollow')).toBe('nofollow')
    expect(safeRel('_self', 'nofollow')).toBe('nofollow')
  })

  it('returns undefined when target is not _blank and no existing rel', () => {
    expect(safeRel(undefined, undefined)).toBeUndefined()
  })

  it('adds noopener and noreferrer when target is _blank', () => {
    expect(safeRel('_blank', undefined)).toBe('noopener noreferrer')
  })

  it('merges noopener and noreferrer into existing rel without duplicates', () => {
    expect(safeRel('_blank', 'nofollow')).toBe('nofollow noopener noreferrer')
    expect(safeRel('_blank', 'noopener')).toBe('noopener noreferrer')
    expect(safeRel('_blank', 'noopener noreferrer nofollow')).toBe('noopener noreferrer nofollow')
  })
})
