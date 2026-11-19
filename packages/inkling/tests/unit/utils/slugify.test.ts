import { DEFAULT_INKLING_VERSION, isLegacyVersion, slugify } from '@kobato/inkling-internal/utils/slugify'
import { describe, expect, it } from 'vitest'

describe('isLegacyVersion', () => {
  it('treats versions that do not parse as latest', () => {
    expect(isLegacyVersion('not-a-version')).toBe(false)
    expect(isLegacyVersion('')).toBe(false)
  })

  it('treats pre-4.0 versions as legacy and 4.x as latest', () => {
    expect(isLegacyVersion('3.9')).toBe(true)
    expect(isLegacyVersion('4.0')).toBe(false)
    expect(isLegacyVersion('4.2')).toBe(false)
  })
})

describe('slugify version policy', () => {
  it('defaults to the latest (4.0) slug format', () => {
    expect(DEFAULT_INKLING_VERSION).toBe('4.0')
    expect(slugify('Header One', { type: 'markdown' })).toBe('header-one')
    expect(slugify('Header One', { inklingVersion: '3.9', type: 'markdown' })).toBe('headerone')
  })
})
