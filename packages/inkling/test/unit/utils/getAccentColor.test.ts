import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getAccentColor } from '@/utils/getAccentColor'

describe('getAccentColor', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.className = 'inkling-lexical'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    editor.remove()
  })

  it('returns the css custom property value when present', () => {
    const originalGetComputedStyle = window.getComputedStyle
    window.getComputedStyle = () => ({ getPropertyValue: () => '#abcdef' }) as unknown as CSSStyleDeclaration

    expect(getAccentColor()).toBe('#abcdef')

    window.getComputedStyle = originalGetComputedStyle
  })

  it('falls back to the default pink when the property is empty', () => {
    const originalGetComputedStyle = window.getComputedStyle
    window.getComputedStyle = () => ({ getPropertyValue: () => '' }) as unknown as CSSStyleDeclaration

    expect(getAccentColor()).toBe('#ff0095')

    window.getComputedStyle = originalGetComputedStyle
  })

  it('falls back to the default pink when no editor element exists', () => {
    editor.remove()
    expect(getAccentColor()).toBe('#ff0095')
  })
})
