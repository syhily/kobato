import { afterEach, describe, expect, it } from 'vitest'

import {
  getEventProvenance,
  isTypeaheadMenuOpen,
  markEventFromCaptionEditor,
  markEventFromNested,
} from '@/plugins/behaviour/nested-editor-protocol'

function keyEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Enter' })
}

describe('nested-editor protocol: event provenance', () => {
  it('round-trips the nested-editor mark', () => {
    const event = keyEvent()
    expect(markEventFromNested(event)).toBe(event)
    expect(getEventProvenance(event)).toBe('nested-editor')
  })

  it('round-trips the caption-editor mark', () => {
    const event = keyEvent()
    expect(markEventFromCaptionEditor(event)).toBe(event)
    expect(getEventProvenance(event)).toBe('caption-editor')
  })

  it('reports null provenance for an unmarked event', () => {
    expect(getEventProvenance(keyEvent())).toBeNull()
  })

  it('reports null provenance for a null event (the IME/mobile dispatch path)', () => {
    expect(getEventProvenance(null)).toBeNull()
    expect(getEventProvenance(undefined)).toBeNull()
  })

  it('distinguishes the two nested kinds on the same event object', () => {
    const nestedEvent = markEventFromNested(keyEvent())
    const captionEvent = markEventFromCaptionEditor(keyEvent())
    expect(getEventProvenance(nestedEvent)).not.toBe(getEventProvenance(captionEvent))
  })
})

describe('nested-editor protocol: typeahead presence', () => {
  afterEach(() => {
    document.getElementById('typeahead-menu')?.remove()
  })

  it('is closed when no menu container is in the DOM', () => {
    expect(isTypeaheadMenuOpen()).toBe(false)
  })

  it('is open when Lexical’s menu container is in the DOM', () => {
    const menu = document.createElement('div')
    menu.id = 'typeahead-menu'
    document.body.appendChild(menu)

    expect(isTypeaheadMenuOpen()).toBe(true)

    menu.remove()
    expect(isTypeaheadMenuOpen()).toBe(false)
  })
})
