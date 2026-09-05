import { renderHook } from '@testing-library/react'
import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import { useWordCountHandle } from '@/context/WordCountHandleContext'
import { createWordCountHandle, publishWordCountCallback } from '@/plugins/behaviour/wordCountHandle'

// Thin per-instance suite: the generic handle semantics (partial setState,
// change guard, subscribe/unsubscribe, fallback) live in
// composer-handle.test.ts. What remains here is the word-count channel's own
// state shape and its context wiring.

describe('createWordCountHandle', () => {
  it('starts with no callback and no language', () => {
    const handle = createWordCountHandle()

    expect(handle.getState()).toEqual({ onChange: null, language: null })
  })
})

describe('WordCountHandleContext', () => {
  it('falls back to a default handle outside any provider', () => {
    const { result } = renderHook(() => useWordCountHandle())

    expect(result.current.getState()).toEqual({ onChange: null, language: null })
  })
})

describe('publishWordCountCallback', () => {
  it('publishes on a top-level editor and unpublishes on teardown', () => {
    const handle = createWordCountHandle()
    const editor = createEditor({ namespace: 'test', onError: () => {} })
    const onChange = () => {}

    const unpublish = publishWordCountCallback(handle, editor, { onChange, language: 'en' })
    expect(handle.getState()).toEqual({ onChange, language: 'en' })

    unpublish()
    expect(handle.getState()).toEqual({ onChange: null, language: null })
  })

  it('never publishes from a nested editor', () => {
    const handle = createWordCountHandle()
    const parent = createEditor({ namespace: 'parent', onError: () => {} })
    const nested = createEditor({ namespace: 'nested', parentEditor: parent, onError: () => {} })

    const unpublish = publishWordCountCallback(handle, nested, { onChange: () => {}, language: 'en' })
    expect(handle.getState()).toEqual({ onChange: null, language: null })

    unpublish()
    expect(handle.getState()).toEqual({ onChange: null, language: null })
  })
})
