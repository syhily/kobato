import { readCaptionFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-caption-from-element'
import { createTestDom } from '@kobato/inkling/tests/utils/render-live'
import { describe, expect, it } from 'vitest'

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
