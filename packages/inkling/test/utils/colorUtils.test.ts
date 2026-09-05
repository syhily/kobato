import { Color, textColorForBackgroundColor } from '@/utils/index'

describe('colorUtils', function () {
  describe('Color', function () {
    it('re-exports the Color library', function () {
      const c = Color('#ff0000')
      expect(c.hex()).toBe('#FF0000')
    })

    it('constructs from RGB object', function () {
      expect(Color({ r: 255, g: 255, b: 255 }).hex()).toBe('#FFFFFF')
    })
  })

  describe('textColorForBackgroundColor', function () {
    it('returns black for a light background', function () {
      expect(textColorForBackgroundColor('#ffffff').hex()).toBe('#000000')
    })

    it('returns white for a dark background', function () {
      expect(textColorForBackgroundColor('#000000').hex()).toBe('#FFFFFF')
    })

    it('returns white for a mid-dark background', function () {
      expect(textColorForBackgroundColor('#333333').hex()).toBe('#FFFFFF')
    })

    it('returns white for the #cccccc Lab-b edge case', function () {
      // .b() returns the Lab b-channel, not RGB blue — preserved from upstream source
      expect(textColorForBackgroundColor('#cccccc').hex()).toBe('#FFFFFF')
    })

    it('accepts a Color instance as input', function () {
      expect(textColorForBackgroundColor(Color('#000000')).hex()).toBe('#FFFFFF')
    })
  })
})
