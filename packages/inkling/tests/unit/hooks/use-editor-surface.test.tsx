import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { useEditorSurface } from '@kobato/inkling'
import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '@kobato/inkling/tests/utils/lexical'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

function renderSurface(prepareSeed?: (body: LexicalEditorState) => LexicalEditorState) {
  const onBodyChange = vi.fn()
  const initialBody = emptyLexicalBody()
  const { result } = renderHook(() => useEditorSurface({ initialBody, bodyKey: 'k1', onBodyChange, prepareSeed }))
  return { result, onBodyChange, initialBody }
}

describe('useEditorSurface', () => {
  it('pins the mount-time seed and forwards serialized changes', () => {
    const { result, onBodyChange, initialBody } = renderSurface()
    expect(result.current.mountedInitialState).toBe(initialBody)

    const next = lexicalBodyWith([lexicalParagraph('typed')])
    act(() => result.current.handleChange(next))
    expect(onBodyChange).toHaveBeenCalledWith(next)
  })

  it('shapes the seed through prepareSeed before mounting', () => {
    const shaped = lexicalBodyWith([lexicalParagraph('shaped')])
    const prepareSeed = vi.fn(() => shaped)
    const { result } = renderSurface(prepareSeed)
    expect(prepareSeed).toHaveBeenCalledWith(emptyLexicalBody())
    expect(result.current.mountedInitialState).toBe(shaped)
  })

  it('tracks the editor instance through registerAPI', () => {
    const { result } = renderSurface()
    expect(result.current.editorInstance).toBeNull()

    const editorInstance = { fake: true }
    act(() => result.current.registerAPI({ editorInstance } as never))
    expect(result.current.editorInstance).toBe(editorInstance)

    act(() => result.current.registerAPI(null))
    expect(result.current.editorInstance).toBeNull()
  })
})
