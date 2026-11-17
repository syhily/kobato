import { describe, expect, it } from 'vitest'

import { readImageAttributesFromElement } from '../../../src/nodes/base/utils/read-image-attributes-from-element'
import { createTestDom } from '../../utils/render-live'

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
