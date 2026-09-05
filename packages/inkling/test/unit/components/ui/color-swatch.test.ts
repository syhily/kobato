import { describe, expect, it } from 'vitest'

import type { ColorSwatchData } from '@/components/ui/ColorPicker'

import {
  isColorKeyword,
  resolveSelectedSwatchTitle,
  resolveSwatchDisplayColor,
  resolveSwatchValue,
} from '@/components/ui/color-swatch'

const SWATCHES: ColorSwatchData[] = [
  { title: 'Accent', accent: true },
  { title: 'Image', image: true },
  { title: 'None', transparent: true },
  { title: 'Red', hex: '#ff0000' },
  { title: 'Blue', hex: '#0000ff' },
]

describe('isColorKeyword', () => {
  it('names the three keywords and nothing else', () => {
    expect(isColorKeyword('accent')).toBe(true)
    expect(isColorKeyword('transparent')).toBe(true)
    expect(isColorKeyword('image')).toBe(true)
    expect(isColorKeyword('#ff0000')).toBe(false)
    expect(isColorKeyword('')).toBe(false)
  })
})

describe('resolveSwatchDisplayColor', () => {
  it('resolves accent through getAccentColor (the default when no editor is mounted)', () => {
    expect(resolveSwatchDisplayColor('accent', { transparentAs: 'white' })).toBe('#ff0095')
  })

  it('paints image as transparent (the icon carries the meaning)', () => {
    expect(resolveSwatchDisplayColor('image', { transparentAs: 'white' })).toBe('transparent')
  })

  it('paints transparent as the caller stand-in', () => {
    expect(resolveSwatchDisplayColor('transparent', { transparentAs: 'white' })).toBe('white')
    expect(resolveSwatchDisplayColor('transparent', { transparentAs: '' })).toBe('')
  })

  it('passes raw values through', () => {
    expect(resolveSwatchDisplayColor('#123456', { transparentAs: 'white' })).toBe('#123456')
  })
})

describe('resolveSwatchValue', () => {
  it('selects the keyword a swatch carries, else its hex', () => {
    expect(resolveSwatchValue({ accent: true })).toBe('accent')
    expect(resolveSwatchValue({ transparent: true })).toBe('transparent')
    expect(resolveSwatchValue({ hex: '#ff0000' })).toBe('#ff0000')
    expect(resolveSwatchValue({})).toBeUndefined()
  })

  it('prefers the keyword over a hex when both are set', () => {
    expect(resolveSwatchValue({ accent: true, hex: '#ff0000' })).toBe('accent')
  })
})

describe('resolveSelectedSwatchTitle', () => {
  it('resolves each keyword to its swatch title', () => {
    expect(resolveSelectedSwatchTitle('accent', SWATCHES)).toBe('Accent')
    expect(resolveSelectedSwatchTitle('image', SWATCHES)).toBe('Image')
    expect(resolveSelectedSwatchTitle('transparent', SWATCHES)).toBe('None')
  })

  it('resolves a raw hex by match, and nothing when unmatched', () => {
    expect(resolveSelectedSwatchTitle('#ff0000', SWATCHES)).toBe('Red')
    expect(resolveSelectedSwatchTitle('#123456', SWATCHES)).toBeUndefined()
  })
})
