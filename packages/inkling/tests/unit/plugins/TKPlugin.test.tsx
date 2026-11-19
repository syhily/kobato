import CardContext, { type CardContextValue } from '@kobato/inkling-internal/context/CardContext'
import { TKHandleContext } from '@kobato/inkling-internal/context/TKHandleContext'
import { useInklingTextEntity } from '@kobato/inkling-internal/hooks/useInklingTextEntity'
import { ExtendedTextNode, TKNode } from '@kobato/inkling-internal/nodes/base'
import { createTKHandle, type TKHandle } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'
import { getTKMatch } from '@kobato/inkling-internal/plugins/behaviour/tk-matcher'
import TKPlugin from '@kobato/inkling-internal/plugins/TKPlugin'
import { mockComposerContext } from '@kobato/inkling/tests/utils/composer-context'
import { createTestEditor, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { render, screen } from '@testing-library/react'
import { $createTextNode, type LexicalEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

vi.mock('@kobato/inkling-internal/hooks/useInklingTextEntity', () => ({
  useInklingTextEntity: vi.fn(),
}))

function createCardContextValue(overrides: Partial<CardContextValue> = {}): CardContextValue {
  return {
    captionHasFocus: false,
    nodeKey: undefined,
    setCaptionHasFocus: vi.fn(),
    ...overrides,
  }
}

function mockComposerEditor(editor: LexicalEditor) {
  mockComposerContext(editor)
}

function renderTKPlugin(handle: TKHandle, cardValue: CardContextValue) {
  return render(
    <TKHandleContext.Provider value={handle}>
      <CardContext.Provider value={cardValue}>
        <TKPlugin />
      </CardContext.Provider>
    </TKHandleContext.Provider>,
  )
}

describe('TKPlugin', () => {
  let editor: LexicalEditor
  let handle: TKHandle

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<div data-lexical-editor="true"></div>'
    handle = createTKHandle()
  })

  it('throws when TKNode is not registered', () => {
    editor = createTestEditor({ headless: false })
    mockComposerEditor(editor)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cardValue = createCardContextValue()
    expect(() => {
      renderTKPlugin(handle, cardValue)
    }).toThrow('TKPlugin: TKNode not registered on editor')

    consoleError.mockRestore()
  })

  it('returns null when in nested editor', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    mockComposerEditor(editor)

    const cardValue = createCardContextValue({ nodeKey: 'card-1' })
    const { container } = renderTKPlugin(handle, cardValue)

    expect(container.firstChild).toBeNull()
  })

  it('returns null when editor has no root parent', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    mockComposerEditor(editor)

    editor.setRootElement(null)

    const cardValue = createCardContextValue()
    const { container } = renderTKPlugin(handle, cardValue)

    expect(container.firstChild).toBeNull()
  })

  it('renders TK indicators for top-level editor', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    editor.setRootElement(document.querySelector('[data-lexical-editor]') as HTMLElement)
    mockComposerEditor(editor)

    const paragraph = document.createElement('p')
    paragraph.setAttribute('data-lexical-decorator', 'true')
    document.body.appendChild(paragraph)

    handle.setState({
      tkNodeMap: {
        'paragraph-key': ['tk-1', 'tk-2'],
      },
      tkCount: 2,
    })

    vi.spyOn(editor, 'getElementByKey').mockImplementation((key: string) => {
      if (key === 'paragraph-key') {
        return paragraph
      }
      return null
    })

    const cardValue = createCardContextValue()
    renderTKPlugin(handle, cardValue)

    expect(screen.getAllByTestId('tk-indicator')).toHaveLength(1)
  })

  it('does not render indicator when parent container is missing', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    editor.setRootElement(document.querySelector('[data-lexical-editor]') as HTMLElement)
    mockComposerEditor(editor)

    handle.setState({
      tkNodeMap: {
        'missing-key': ['tk-1'],
      },
      tkCount: 1,
    })

    vi.spyOn(editor, 'getElementByKey').mockReturnValue(null)

    const cardValue = createCardContextValue()
    const { container } = renderTKPlugin(handle, cardValue)

    expect(container.firstChild).toBeNull()
  })

  it('removes editor on unmount', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    editor.setRootElement(document.querySelector('[data-lexical-editor]') as HTMLElement)
    mockComposerEditor(editor)

    const removeEditor = vi.spyOn(handle, 'removeEditor')

    const cardValue = createCardContextValue()
    const { unmount } = renderTKPlugin(handle, cardValue)

    unmount()
    expect(removeEditor).toHaveBeenCalledWith(editor.getKey())
  })

  it('wires the real TK matcher and node classes into useInklingTextEntity', () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    editor.setRootElement(document.querySelector('[data-lexical-editor]') as HTMLElement)
    mockComposerEditor(editor)

    const cardValue = createCardContextValue()
    renderTKPlugin(handle, cardValue)

    const [getMatch, targetNode, createNode, nodeType] = vi.mocked(useInklingTextEntity).mock.calls[0]
    expect(getMatch).toBe(getTKMatch)
    expect(targetNode).toBe(TKNode)
    expect(createNode).toBeInstanceOf(Function)
    expect(nodeType).toBe(ExtendedTextNode)
  })

  it('the createTKNode passed to the hook builds a TKNode with the text content', async () => {
    editor = createTestEditor({ nodes: [TKNode, ExtendedTextNode], headless: false })
    editor.setRootElement(document.querySelector('[data-lexical-editor]') as HTMLElement)
    mockComposerEditor(editor)

    const cardValue = createCardContextValue()
    renderTKPlugin(handle, cardValue)

    const [, , createTKNode] = vi.mocked(useInklingTextEntity).mock.calls[0]

    let isTKNode = false
    let textContent = ''
    await updateEditor(editor, () => {
      const tkNode = createTKNode($createTextNode('TK test'))
      isTKNode = tkNode instanceof TKNode
      textContent = tkNode.getTextContent()
    })

    expect(isTKNode).toBe(true)
    expect(textContent).toBe('TK test')
  })
})
