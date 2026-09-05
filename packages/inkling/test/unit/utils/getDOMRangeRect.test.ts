import { describe, expect, it } from 'vitest'

import { getDOMRangeRect } from '#/utils/getDOMRangeRect'

describe('getDOMRangeRect', () => {
  it('returns the bounding client rect from the range', () => {
    const rect = new DOMRect(1, 2, 3, 4)
    const range = { getBoundingClientRect: () => rect } as unknown as Range
    const selection = { anchorNode: document.createTextNode('x'), getRangeAt: () => range } as unknown as Selection
    const root = document.createElement('div')

    expect(getDOMRangeRect(selection, root)).toBe(rect)
  })

  it('uses the deepest firstElementChild when anchor is the root element', () => {
    const root = document.createElement('div')
    const outer = document.createElement('section')
    const inner = document.createElement('span')
    const rect = new DOMRect(5, 6, 7, 8)

    inner.getBoundingClientRect = () => rect
    outer.appendChild(inner)
    root.appendChild(outer)

    const range = {} as Range
    const selection = { anchorNode: root, getRangeAt: () => range } as unknown as Selection

    expect(getDOMRangeRect(selection, root)).toBe(rect)
  })
})
