import { act, render } from '@testing-library/react'
import { createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InklingNestedComposer from '@/components/InklingNestedComposer'
import InklingCollaborationContext from '@/context/InklingCollaborationContext'
import { WordCountHandleContext } from '@/context/WordCountHandleContext'
import { createWordCountHandle, type WordCountHandle } from '@/plugins/behaviour/wordCountHandle'
import WordCountPlugin from '@/plugins/WordCountPlugin'

// The pin is the conditional mount of the nested WordCountPlugin, not
// Lexical's nested composer machinery, so everything below the conditional is
// mocked out.
vi.mock('@lexical/react/LexicalNestedComposer', () => ({
  LexicalNestedComposer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@lexical/react/LexicalCollaborationContext', () => ({
  useCollaborationContext: () => ({ isCollabActive: false }),
}))
vi.mock('@lexical/react/LexicalCollaborationPlugin', () => ({
  CollaborationPlugin: vi.fn(() => null),
}))
vi.mock('@/plugins/WordCountPlugin', () => ({
  WordCountPlugin: vi.fn(() => null),
  default: vi.fn(() => null),
}))
vi.mock('@/plugins/TKPlugin', () => ({
  default: () => null,
}))
vi.mock('@/plugins/ReplacementStringsPlugin', () => ({
  default: () => null,
}))

function createCollaborationValue() {
  return {
    createWebsocketProvider: vi.fn(),
  }
}

function renderNestedComposer(wordCountHandle: WordCountHandle) {
  const collaborationValue = createCollaborationValue()

  return render(
    <InklingCollaborationContext.Provider value={collaborationValue}>
      <WordCountHandleContext.Provider value={wordCountHandle}>
        <InklingNestedComposer initialEditor={createEditor({ namespace: 'test', onError: () => {} })}>
          <div />
        </InklingNestedComposer>
      </WordCountHandleContext.Provider>
    </InklingCollaborationContext.Provider>,
  )
}

describe('InklingNestedComposer word-count channel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts a nested WordCountPlugin when the callback is published before render', () => {
    const onChange = vi.fn()
    const wordCountHandle = createWordCountHandle()
    wordCountHandle.setState({ onChange })

    renderNestedComposer(wordCountHandle)

    expect(vi.mocked(WordCountPlugin)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(WordCountPlugin).mock.calls[0][0]).toEqual({ onChange })
  })

  it('does not mount a nested WordCountPlugin while no callback is published', () => {
    renderNestedComposer(createWordCountHandle())

    expect(vi.mocked(WordCountPlugin)).not.toHaveBeenCalled()
  })

  it('mounts the nested WordCountPlugin reactively when the callback lands after render', () => {
    // the top-level plugin publishes in a layout effect, which can land after
    // a nested composer's first render — the handle subscription must re-render
    // the nested composer and mount the plugin without any unrelated re-render
    const wordCountHandle = createWordCountHandle()
    renderNestedComposer(wordCountHandle)

    expect(vi.mocked(WordCountPlugin)).not.toHaveBeenCalled()

    const onChange = vi.fn()
    act(() => {
      wordCountHandle.setState({ onChange })
    })

    expect(vi.mocked(WordCountPlugin)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(WordCountPlugin).mock.calls[0][0]).toEqual({ onChange })
  })
})
