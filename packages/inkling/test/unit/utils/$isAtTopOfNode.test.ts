import { describe, expect, it } from 'vitest'

import { $isAtTopOfNode } from '@/utils/$isAtTopOfNode'

describe('$isAtTopOfNode', () => {
  it('returns undefined when there are no client rects', () => {
    const selection = {
      anchorNode: document.createTextNode('x'),
      getRangeAt: () => ({
        cloneRange: () => ({
          getClientRects: () => [],
        }),
      }),
    } as unknown as Selection

    expect($isAtTopOfNode(selection)).toBeUndefined()
  })

  it('returns true when the range is near the top of the native element', () => {
    const root = document.createElement('div')
    root.setAttribute('data-lexical-editor', 'true')
    const paragraph = document.createElement('p')
    const text = document.createTextNode('hello')
    paragraph.appendChild(text)
    root.appendChild(paragraph)

    paragraph.getBoundingClientRect = () => new DOMRect(0, 100, 100, 20)

    const selection = {
      anchorNode: text,
      getRangeAt: () => ({
        cloneRange: () => ({
          getClientRects: () => [new DOMRect(0, 100, 10, 10)],
        }),
      }),
    } as unknown as Selection

    expect($isAtTopOfNode(selection)).toBe(true)
  })

  it('returns false when the range is far from the top', () => {
    const root = document.createElement('div')
    root.setAttribute('data-lexical-editor', 'true')
    const paragraph = document.createElement('p')
    const text = document.createTextNode('hello')
    paragraph.appendChild(text)
    root.appendChild(paragraph)

    paragraph.getBoundingClientRect = () => new DOMRect(0, 100, 100, 20)

    const selection = {
      anchorNode: text,
      getRangeAt: () => ({
        cloneRange: () => ({
          getClientRects: () => [new DOMRect(0, 150, 10, 10)],
        }),
      }),
    } as unknown as Selection

    expect($isAtTopOfNode(selection)).toBe(false)
  })
})
