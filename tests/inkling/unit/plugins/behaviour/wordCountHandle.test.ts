import { renderHook } from '@testing-library/react'
import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import { useWordCountHandle } from '@/inkling/context/WordCountHandleContext'
import { createWordCountHandle, publishWordCountCallback } from '@/inkling/plugins/behaviour/wordCountHandle'

// Thin per-instance suite: the generic handle semantics (partial setState,
// change guard, subscribe/unsubscribe, fallback) live in
// composer-handle.test.ts. What remains here is the word-count channel's own
// state shape and its context wiring.

describe('createWordCountHandle', () => {
  it('starts with no callbacks and no language', () => {
    const handle = createWordCountHandle()

    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })
})

describe('WordCountHandleContext', () => {
  it('falls back to a default handle outside any provider', () => {
    const { result } = renderHook(() => useWordCountHandle())

    expect(result.current.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })
})

describe('publishWordCountCallback', () => {
  it('publishes on a top-level editor and unpublishes on teardown', () => {
    const handle = createWordCountHandle()
    const editor = createEditor({ namespace: 'test', onError: () => {} })
    const onChange = () => {}

    const unpublish = publishWordCountCallback(handle, editor, { onChange, language: 'en' })
    expect(handle.getState()).toEqual({ onChange, onSelectionChange: null, language: 'en' })

    unpublish()
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('publishes a selection-only callback without an onChange channel', () => {
    const handle = createWordCountHandle()
    const editor = createEditor({ namespace: 'test', onError: () => {} })
    const onSelectionChange = () => {}

    const unpublish = publishWordCountCallback(handle, editor, { onSelectionChange, language: null })
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange, language: null })

    unpublish()
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('never publishes from a nested editor', () => {
    const handle = createWordCountHandle()
    const parent = createEditor({ namespace: 'parent', onError: () => {} })
    const nested = createEditor({ namespace: 'nested', parentEditor: parent, onError: () => {} })

    const unpublish = publishWordCountCallback(handle, nested, { onChange: () => {}, language: 'en' })
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })

    unpublish()
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })
})

describe('publishWordCountCallback ownership', () => {
  const makeEditor = () => createEditor({ namespace: 'test', onError: () => {} })

  it('keeps onChange and onSelectionChange independent', () => {
    const handle = createWordCountHandle()
    const editor = makeEditor()
    const onChange = () => {}
    const onSelectionChange = () => {}

    const unpublishCount = publishWordCountCallback(handle, editor, { onChange, language: null })
    const unpublishSelection = publishWordCountCallback(handle, editor, { onSelectionChange, language: null })

    expect(handle.getState()).toEqual({ onChange, onSelectionChange, language: null })

    // unmounting the selection-only publisher leaves the count publisher alone
    unpublishSelection()
    expect(handle.getState()).toEqual({ onChange, onSelectionChange: null, language: null })

    unpublishCount()
    expect(handle.getState()).toEqual({ onChange: null, onSelectionChange: null, language: null })
  })

  it('removes an older publisher from any stack position (A unmounts while B remains, then B unmounts)', () => {
    const handle = createWordCountHandle()
    const editor = makeEditor()
    const a = () => {}
    const b = () => {}
    const c = () => {}

    const unpublishA = publishWordCountCallback(handle, editor, { onChange: a, language: null })
    const unpublishB = publishWordCountCallback(handle, editor, { onChange: b, language: null })
    expect(handle.getState().onChange).toBe(b)

    // A unmounts while B is on top: A's token is removed from beneath B
    unpublishA()
    expect(handle.getState().onChange).toBe(b)

    // both owners are gone — no stale A to restore
    unpublishB()
    expect(handle.getState().onChange).toBeNull()

    // a later publisher's teardown must not resurrect A either
    const unpublishC = publishWordCountCallback(handle, editor, { onChange: c, language: null })
    unpublishC()
    expect(handle.getState().onChange).toBeNull()
  })

  it('restores a still-mounted predecessor: A→B→B cleanup→A cleanup', () => {
    const handle = createWordCountHandle()
    const editor = makeEditor()
    const a = () => {}
    const b = () => {}

    const unpublishA = publishWordCountCallback(handle, editor, { onChange: a, language: null })
    const unpublishB = publishWordCountCallback(handle, editor, { onChange: b, language: null })
    expect(handle.getState().onChange).toBe(b)

    unpublishB()
    expect(handle.getState().onChange).toBe(a)

    unpublishA()
    expect(handle.getState().onChange).toBeNull()
  })

  it('does not let a null language publish clear an existing language', () => {
    const handle = createWordCountHandle()
    const editor = makeEditor()

    const unpublishLanguage = publishWordCountCallback(handle, editor, { onChange: () => {}, language: 'zh-CN' })
    const unpublishNoLanguage = publishWordCountCallback(handle, editor, {
      onSelectionChange: () => {},
      language: null,
    })

    expect(handle.getState().language).toBe('zh-CN')

    unpublishNoLanguage()
    expect(handle.getState().language).toBe('zh-CN')

    unpublishLanguage()
    expect(handle.getState().language).toBeNull()
  })

  it('publishes replacement callbacks to subscribers for nested continuity', () => {
    const handle = createWordCountHandle()
    const editor = makeEditor()
    const a = () => {}
    const b = () => {}
    const seen: Array<((count: number | null) => void) | null> = []

    handle.subscribe((state) => {
      seen.push(state.onSelectionChange)
    })

    const unpublishA = publishWordCountCallback(handle, editor, { onSelectionChange: a, language: null })
    const unpublishB = publishWordCountCallback(handle, editor, { onSelectionChange: b, language: null })
    expect(seen.at(-1)).toBe(b)

    unpublishB()
    expect(seen.at(-1)).toBe(a)

    unpublishA()
    expect(seen.at(-1)).toBeNull()
  })
})
