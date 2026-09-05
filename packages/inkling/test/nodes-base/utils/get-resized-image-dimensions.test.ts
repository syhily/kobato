import { getResizedImageDimensions } from '@/nodes/base/utils/get-resized-image-dimensions'

describe('Utils: getResizedImageDimensions', function () {
  it('returns original dimensions when no target size is given', function () {
    expect(getResizedImageDimensions({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 })
  })

  it('scales by width maintaining aspect ratio', function () {
    expect(getResizedImageDimensions({ width: 800, height: 600 }, { width: 400 })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('scales by height maintaining aspect ratio', function () {
    expect(getResizedImageDimensions({ width: 800, height: 600 }, { height: 300 })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('rounds dimensions to nearest integer', function () {
    expect(getResizedImageDimensions({ width: 1000, height: 3 }, { width: 1 })).toEqual({ width: 1, height: 0 })
  })
})
