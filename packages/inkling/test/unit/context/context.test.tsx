import { render } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import CardContext from '@/context/CardContext'
import InklingCollaborationContext from '@/context/InklingCollaborationContext'
import {
  useInklingDragScrollContainerSelector,
  useInklingGifSettings,
  useInklingHostEssentials,
  useInklingLibrarySettings,
  useInklingLinkingSettings,
  useInklingMathSettings,
  useInklingSnippetSettings,
  useInklingUploadSettings,
} from '@/context/InklingHostIntegrationContext'
import InklingUiPrefsContext from '@/context/InklingUiPrefsContext'
import {
  SharedEditorStateContext,
  useSharedEditorStateContext,
  type SharedEditorStateContextValue,
} from '@/context/SharedEditorStateContext'

describe('host-integration channels', () => {
  it('provides the default channel values without a provider', () => {
    let essentials: ReturnType<typeof useInklingHostEssentials> | undefined
    let gif: ReturnType<typeof useInklingGifSettings> | undefined
    let linking: ReturnType<typeof useInklingLinkingSettings> | undefined
    let snippet: ReturnType<typeof useInklingSnippetSettings> | undefined
    let upload: ReturnType<typeof useInklingUploadSettings> | undefined
    let math: ReturnType<typeof useInklingMathSettings> | undefined
    let library: ReturnType<typeof useInklingLibrarySettings> | undefined
    let dragScroll: ReturnType<typeof useInklingDragScrollContainerSelector>

    function Consumer() {
      essentials = useInklingHostEssentials()
      gif = useInklingGifSettings()
      linking = useInklingLinkingSettings()
      snippet = useInklingSnippetSettings()
      upload = useInklingUploadSettings()
      math = useInklingMathSettings()
      library = useInklingLibrarySettings()
      dragScroll = useInklingDragScrollContainerSelector()
      return null
    }

    render(<Consumer />)

    expect(essentials!.fileUploader).toBeDefined()
    expect(essentials!.onError).toBeDefined()
    expect(gif).toEqual({})
    expect(linking).toEqual({})
    expect(snippet).toEqual({})
    expect(upload).toEqual({})
    expect(math).toEqual({})
    expect(library).toEqual({})
    expect(dragScroll).toBeUndefined()
  })
})

describe('InklingCollaborationContext', () => {
  it('provides the default context value', () => {
    let captured: typeof InklingCollaborationContext extends React.Context<infer V> ? V : never

    function Consumer() {
      captured = React.useContext(InklingCollaborationContext)
      return null
    }

    render(<Consumer />)

    expect(captured!.createWebsocketProvider).toBeDefined()
  })
})

describe('InklingUiPrefsContext', () => {
  it('provides the default context value', () => {
    let captured: typeof InklingUiPrefsContext extends React.Context<infer V> ? V : never

    function Consumer() {
      captured = React.useContext(InklingUiPrefsContext)
      return null
    }

    render(<Consumer />)

    expect(captured!.darkMode).toBe(false)
  })
})

describe('CardContext', () => {
  it('provides the default context value', () => {
    let captured: typeof CardContext extends React.Context<infer V> ? V : never

    function Consumer() {
      captured = React.useContext(CardContext)
      return null
    }

    render(<Consumer />)

    expect(captured!.captionHasFocus).toBe(false)
    expect(captured!.nodeKey).toBeUndefined()
    expect(typeof captured!.setCaptionHasFocus).toBe('function')
  })
})

describe('SharedEditorStateContext', () => {
  it('isolates fallback history state between provider-less consumers', () => {
    const captured: SharedEditorStateContextValue[] = []

    function Consumer() {
      captured.push(useSharedEditorStateContext())
      return null
    }

    render(
      <>
        <Consumer />
        <Consumer />
      </>,
    )

    expect(captured).toHaveLength(2)
    expect(captured[0].historyState).not.toBe(captured[1].historyState)
    expect(captured[0].onChange).toBeUndefined()
    expect(captured[1].onChange).toBeUndefined()
  })

  it('keeps the history state stable when the onChange identity changes', () => {
    const captured: SharedEditorStateContextValue[] = []

    function Consumer() {
      captured.push(useSharedEditorStateContext())
      return null
    }

    const { rerender } = render(
      <SharedEditorStateContext onChange={() => {}}>
        <Consumer />
      </SharedEditorStateContext>,
    )
    rerender(
      <SharedEditorStateContext onChange={() => {}}>
        <Consumer />
      </SharedEditorStateContext>,
    )

    expect(captured.length).toBeGreaterThanOrEqual(2)
    const first = captured[0]
    for (const value of captured) {
      expect(value.historyState).toBe(first.historyState)
    }
    // the fresh onChange still flows through — only the undo stack is pinned
    expect(captured[captured.length - 1].onChange).not.toBe(first.onChange)
  })
})
