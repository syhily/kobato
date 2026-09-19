import { describe, expect, it } from 'vitest'

import { createTestDom } from '#/inkling/utils/render-live'
import { readCaptionFromElement } from '@/inkling/nodes/base/utils/read-caption-from-element'

describe('readCaptionFromElement', function () {
  it('skips empty cleaned caption fragments when joining captions', function () {
    const document = createTestDom(`
            <figure>
                <figcaption><p>First</p></figcaption>
                <figcaption><p> </p></figcaption>
                <figcaption><p>Third</p></figcaption>
            </figure>
        `).window.document

    const caption = readCaptionFromElement(document.querySelector('figure')!)

    expect(caption).toBe('<p>First</p> / <p>Third</p>')
  })
})
