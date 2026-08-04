import { headingLevelFromStyle, headingStyleFromLevel } from '@kobato/shared/legacy-pt/heading-levels'
import { describe, expect, it } from 'vitest'

describe('shared/pt/heading-levels — headingLevelFromStyle', () => {
  it('maps h1-h4 styles to numeric levels', () => {
    expect(headingLevelFromStyle('h1')).toBe(1)
    expect(headingLevelFromStyle('h2')).toBe(2)
    expect(headingLevelFromStyle('h3')).toBe(3)
    expect(headingLevelFromStyle('h4')).toBe(4)
  })

  it('returns null for normal / blockquote / undefined styles', () => {
    expect(headingLevelFromStyle('normal')).toBeNull()
    expect(headingLevelFromStyle('blockquote')).toBeNull()
    expect(headingLevelFromStyle(undefined)).toBeNull()
  })
})

describe('shared/pt/heading-levels — headingStyleFromLevel', () => {
  it('returns the matching style for 1..4', () => {
    expect(headingStyleFromLevel(1)).toBe('h1')
    expect(headingStyleFromLevel(2)).toBe('h2')
    expect(headingStyleFromLevel(3)).toBe('h3')
    expect(headingStyleFromLevel(4)).toBe('h4')
  })

  it('clamps out-of-range levels to h4', () => {
    expect(headingStyleFromLevel(0)).toBe('h4')
    expect(headingStyleFromLevel(5)).toBe('h4')
    expect(headingStyleFromLevel(99)).toBe('h4')
  })
})
