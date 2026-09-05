import { createTestDom } from '#/utils/render-live'
import { readImageAttributesFromElement } from '@/nodes/base/utils/read-image-attributes-from-element'

describe('readImageAttributesFromElement', function () {
  it('omits width and height when the data attributes are missing', function () {
    const document = createTestDom('<img src="/content/images/a.png">').window.document

    const attrs = readImageAttributesFromElement(document.querySelector('img')!)

    expect(attrs.width).toBeUndefined()
    expect(attrs.height).toBeUndefined()
  })

  it('does not surface NaN for garbage data-width/data-height values', function () {
    const document = createTestDom('<img src="/content/images/a.png" data-width="wide" data-height="tall">').window
      .document

    const attrs = readImageAttributesFromElement(document.querySelector('img')!)

    expect(attrs.width).toBeUndefined()
    expect(attrs.height).toBeUndefined()
  })

  it('reads numeric data-width/data-height when the width/height properties are unset', function () {
    const document = createTestDom('<img src="/content/images/a.png" data-width="640" data-height="480">').window
      .document

    const attrs = readImageAttributesFromElement(document.querySelector('img')!)

    expect(attrs.width).toBe(640)
    expect(attrs.height).toBe(480)
  })
})
