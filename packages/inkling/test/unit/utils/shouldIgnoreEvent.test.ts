import { describe, expect, it } from 'vitest'

import { shouldIgnoreEvent } from '@/utils/shouldIgnoreEvent'

describe('shouldIgnoreEvent', () => {
  it('returns false for a missing event', () => {
    expect(shouldIgnoreEvent(null)).toBe(false)
    expect(shouldIgnoreEvent(undefined)).toBe(false)
  })

  it('returns false for Escape and Meta+Enter', () => {
    expect(shouldIgnoreEvent({ key: 'Escape' })).toBe(false)
    expect(shouldIgnoreEvent({ metaKey: true, key: 'Enter' })).toBe(false)
  })

  it('returns true for events originating from form inputs', () => {
    const input = document.createElement('input')
    expect(shouldIgnoreEvent({ target: input })).toBe(true)

    const textarea = document.createElement('textarea')
    expect(shouldIgnoreEvent({ target: textarea })).toBe(true)
  })

  it('returns true for events inside a CodeMirror editor', () => {
    const cm = document.createElement('div')
    cm.className = 'cm-editor'
    const child = document.createElement('span')
    cm.appendChild(child)

    expect(shouldIgnoreEvent({ target: child })).toBe(true)
  })

  it('falls back to activeElement when the target is disconnected', () => {
    const cm = document.createElement('div')
    cm.className = 'cm-editor'
    document.body.appendChild(cm)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    expect(shouldIgnoreEvent({ target: input })).toBe(true)

    input.remove()

    // When target is disconnected and activeElement is inside cm-editor
    cm.focus()
    const detached = document.createElement('input')
    expect(shouldIgnoreEvent({ target: detached })).toBe(true)

    cm.remove()
  })
})
