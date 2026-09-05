import { CARD_WIDTHS, isCardWidth, normalizeCardWidth } from '@/nodes/base/utils/card-widths'

describe('Utils: card-widths', function () {
  describe('CARD_WIDTHS', function () {
    it('contains the supported card widths', function () {
      expect(CARD_WIDTHS).toEqual(['regular', 'wide', 'full'])
    })
  })

  describe('isCardWidth', function () {
    it('returns true for supported card widths', function () {
      expect(isCardWidth('regular')).toBe(true)
      expect(isCardWidth('wide')).toBe(true)
      expect(isCardWidth('full')).toBe(true)
    })

    it('returns false for unknown strings', function () {
      expect(isCardWidth('')).toBe(false)
      expect(isCardWidth('widescreen')).toBe(false)
      expect(isCardWidth('Regular')).toBe(false)
    })

    it('returns false for non-string values', function () {
      expect(isCardWidth(undefined)).toBe(false)
      expect(isCardWidth(null)).toBe(false)
      expect(isCardWidth(42)).toBe(false)
      expect(isCardWidth(['wide'])).toBe(false)
    })
  })

  describe('normalizeCardWidth', function () {
    it('returns the width for supported card widths', function () {
      expect(normalizeCardWidth('regular')).toBe('regular')
      expect(normalizeCardWidth('wide')).toBe('wide')
      expect(normalizeCardWidth('full')).toBe('full')
    })

    it('returns undefined for anything else', function () {
      expect(normalizeCardWidth('unknown')).toBeUndefined()
      expect(normalizeCardWidth(undefined)).toBeUndefined()
      expect(normalizeCardWidth(null)).toBeUndefined()
      expect(normalizeCardWidth(42)).toBeUndefined()
    })
  })
})
