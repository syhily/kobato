// Delta-wiring tests for the shared composer skeleton: EditorSurfaceComposer
// must apply the host constants (zh-CN labels, theme-driven darkMode) while
// forwarding every surface delta verbatim, and useEditorSurface must own the
// registerAPI → editor-instance dance plus the body mount-snapshot/change
// wiring. The inkling barrel is mocked — the composer is the observable
// boundary; the body lifecycle itself is pinned by use-editor-body-reset's
// own suite.

// @vitest-environment happy-dom

import { act, render, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InklingComposerProps } from '@/inkling'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import {
  EditorSurfaceComposer,
  type EditorSurfaceComposerProps,
  useEditorSurface,
} from '@/client/editor/editor-surface'
import { inklingLabels } from '@/client/editor/inkling-labels'
import { THEME_COOKIE } from '@/shared/utils/theme-cookie'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

const composerProps: { current: InklingComposerProps | null } = { current: null }

vi.mock('@/inkling', () => ({
  InklingComposer: vi.fn((props: InklingComposerProps) => {
    composerProps.current = props
    return props.children
  }),
}))

beforeEach(() => {
  composerProps.current = null
  localStorage.clear()
})

type ComposerDeltas = Omit<EditorSurfaceComposerProps, 'nodes' | 'initialEditorState' | 'children'>

function renderComposer(deltas: ComposerDeltas = {}) {
  const nodes = [] as EditorSurfaceComposerProps['nodes']
  const seed = emptyLexicalBody()
  render(
    <ThemeProvider>
      <EditorSurfaceComposer nodes={nodes} initialEditorState={seed} {...deltas}>
        <div data-testid="surface-child" />
      </EditorSurfaceComposer>
    </ThemeProvider>,
  )
  return { nodes, seed }
}

describe('client/editor/EditorSurfaceComposer — host constants', () => {
  it('injects the zh-CN labels and the theme-driven darkMode', () => {
    renderComposer()
    expect(composerProps.current?.labels).toBe(inklingLabels)
    expect(composerProps.current?.darkMode).toBe(false)
  })

  it('flips darkMode with the resolved theme', () => {
    // The provider re-resolves after mount: a stored preference beats the
    // SSR seed, so pin 'dark' through storage rather than initialResolved.
    localStorage.setItem(THEME_COOKIE, 'dark')
    renderComposer()
    expect(composerProps.current?.darkMode).toBe(true)
  })
})

describe('client/editor/EditorSurfaceComposer — delta pass-through', () => {
  it('forwards the node set, seed, ui-prefs flags, and host integration untouched', () => {
    const fileUploader = vi.fn() as never
    const cardConfig = { image: { captionEnabled: true } } as never
    const { nodes, seed } = renderComposer({
      fileUploader,
      cardConfig,
      isEmojiEnabled: false,
      codeEditor: 'plain',
      dragScrollContainerSelector: '[data-kobato-editor-scroll]',
    })
    expect(composerProps.current?.nodes).toBe(nodes)
    expect(composerProps.current?.initialEditorState).toBe(seed)
    expect(composerProps.current?.fileUploader).toBe(fileUploader)
    expect(composerProps.current?.cardConfig).toBe(cardConfig)
    expect(composerProps.current?.isEmojiEnabled).toBe(false)
    expect(composerProps.current?.codeEditor).toBe('plain')
    expect(composerProps.current?.dragScrollContainerSelector).toBe('[data-kobato-editor-scroll]')
  })
})

describe('client/editor/useEditorSurface', () => {
  function renderSurface(prepareSeed?: (body: LexicalEditorState) => LexicalEditorState) {
    const onBodyChange = vi.fn()
    const initialBody = emptyLexicalBody()
    const { result } = renderHook(() => useEditorSurface({ initialBody, bodyKey: 'k1', onBodyChange, prepareSeed }))
    return { result, onBodyChange, initialBody }
  }

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
