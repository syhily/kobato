import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getAccentColor } from '@/inkling/utils/getAccentColor'

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

  it('scopes the probe to the asking editor when two editors share the document', () => {
    const second = document.createElement('div')
    second.className = 'inkling-lexical'
    const firstRoot = document.createElement('div')
    const secondRoot = document.createElement('div')
    editor.appendChild(firstRoot)
    second.appendChild(secondRoot)
    document.body.appendChild(second)

    const originalGetComputedStyle = window.getComputedStyle
    window.getComputedStyle = (el: Element) =>
      ({
        getPropertyValue: () => (el === editor ? '#111111' : el === second ? '#222222' : ''),
      }) as unknown as CSSStyleDeclaration

    // each editor resolves its OWN wrapper's accent, not the first in
    // document order
    expect(getAccentColor(firstRoot)).toBe('#111111')
    expect(getAccentColor(secondRoot)).toBe('#222222')
    // the unscoped probe keeps the legacy first-in-document-order behaviour
    expect(getAccentColor()).toBe('#111111')

    window.getComputedStyle = originalGetComputedStyle
    second.remove()
  })

  it('returns the default pink when the scoped root has no inkling wrapper', () => {
    // the document still carries an editor (from beforeEach) — a scoped miss
    // must NOT leak it
    const orphan = document.createElement('div')
    document.body.appendChild(orphan)

    expect(getAccentColor(orphan)).toBe('#ff0095')

    orphan.remove()
  })
})
