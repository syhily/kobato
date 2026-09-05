import { describe, expect, it } from 'vitest'

import { getTopLevelNativeElement } from '@/utils/getTopLevelNativeElement'

describe('getTopLevelNativeElement', () => {
  it('returns null for a missing node', () => {
    expect(getTopLevelNativeElement(null)).toBeNull()
  })

  it('finds the closest direct child of the lexical editor root', () => {
    const root = document.createElement('div')
    root.setAttribute('data-lexical-editor', 'true')

    const paragraph = document.createElement('p')
    const span = document.createElement('span')
    const text = document.createTextNode('hello')

    root.appendChild(paragraph)
    paragraph.appendChild(span)
    span.appendChild(text)

    expect(getTopLevelNativeElement(paragraph)).toBe(paragraph)
    expect(getTopLevelNativeElement(span)).toBe(paragraph)
    expect(getTopLevelNativeElement(text)).toBe(paragraph)
  })

  it('returns null when no lexical editor ancestor exists', () => {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode('text'))

    expect(getTopLevelNativeElement(div.firstChild)).toBeNull()
  })

  it('returns null for a non-Element node', () => {
    expect(getTopLevelNativeElement(document.createComment('comment'))).toBeNull()
  })
})
