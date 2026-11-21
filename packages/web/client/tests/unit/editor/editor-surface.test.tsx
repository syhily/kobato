// @vitest-environment happy-dom

import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { InklingComposerProps } from '@kobato/inkling'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema.ts'

import { inklingLabelsFor } from '@kobato/i18n/inkling-labels.ts'
import { emptyLexicalBody, lexicalBodyWith, lexicalParagraph } from '@kobato/inkling/tests/utils/lexical.ts'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider.tsx'
import { THEME_COOKIE } from '@kobato/utils/theme-cookie.ts'
import {
  EditorSurfaceComposer,
  type EditorSurfaceComposerProps,
  useEditorSurface,
} from '@kobato/web-client/editor/editor-surface.tsx'
import { wrapWithI18n } from '@kobato/web-client/tests/utils/i18n-render.tsx'
import { act, render, renderHook } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const composerProps: { current: InklingComposerProps | null } = { current: null }

vi.mock('@kobato/inkling', () => ({
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

function renderComposer(deltas: ComposerDeltas = {}, locale: AppLocale = 'zh-CN') {
  const nodes = [] as EditorSurfaceComposerProps['nodes']
  const seed = emptyLexicalBody()
  const routes: RouteObject[] = [
    {
      id: 'root',
      path: '*',
      element: wrapWithI18n(
        <ThemeProvider>
          <EditorSurfaceComposer nodes={nodes} initialEditorState={seed} {...deltas}>
            <div data-testid="surface-child" />
          </EditorSurfaceComposer>
        </ThemeProvider>,
        { locale },
      ),
    },
  ]
  const router = createMemoryRouter(routes, {
    hydrationData: { loaderData: { root: { i18n: { locale, inklingLabels: inklingLabelsFor(locale) } } } },
  })
  render(<RouterProvider router={router} />)
  return { nodes, seed }
}

describe('client/editor/EditorSurfaceComposer — host constants', () => {
  it('injects the active locale labels, word-count language and theme-driven darkMode', () => {
    renderComposer()
    expect(composerProps.current?.labels).toBe(inklingLabelsFor('zh-CN'))
    expect(composerProps.current?.wordCountLanguage).toBe('zh-CN')
    expect(composerProps.current?.darkMode).toBe(false)
  })

  it('switches the labels and the word-count language with the locale', () => {
    renderComposer({}, 'en-US')
    expect(composerProps.current?.labels).toBe(inklingLabelsFor('en-US'))
    expect(composerProps.current?.wordCountLanguage).toBe('en-US')
  })

  it('forwards the surface child exactly once', () => {
    renderComposer()
    expect(composerProps.current?.children).toBeDefined()
  })

  it('flips darkMode with the resolved theme', () => {
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
