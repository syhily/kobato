import { InklingHostIntegrationProvider } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import DEFAULT_NODES from '@kobato/inkling-internal/nodes/DefaultNodes'
import { INSERT_HTML_COMMAND } from '@kobato/inkling-internal/nodes/HtmlNode'
import SlashCardMenuPlugin from '@kobato/inkling-internal/plugins/SlashCardMenuPlugin'
import { mockComposerContext } from '@kobato/inkling/tests/utils/composer-context'
import { createHostIntegrationValue } from '@kobato/inkling/tests/utils/host-integration-context'
import { updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { act, render, screen, waitFor } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: 'test',
    nodes: DEFAULT_NODES,
    onError: () => {},
    theme: {},
  })
}

async function setupSlashPlugin() {
  const editor = createTestEditor()
  const rootElement = document.createElement('div')
  rootElement.setAttribute('contenteditable', 'true')
  document.body.appendChild(rootElement)
  editor.setRootElement(rootElement)
  rootElement.focus()

  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    paragraph.append($createTextNode(''))
    $getRoot().append(paragraph)
    paragraph.select()
  })

  function getAnchorNode(): Node | null {
    const textSpan = rootElement.querySelector('[data-lexical-text="true"]')
    if (textSpan?.firstChild) {
      return textSpan.firstChild
    }
    const paragraph = rootElement.querySelector('p')
    if (!paragraph) {
      return null
    }
    return {
      nodeType: Node.TEXT_NODE,
      nodeValue: '',
      parentNode: paragraph,
      textContent: '',
    } as unknown as Node
  }

  vi.spyOn(window, 'getSelection').mockImplementation(
    () =>
      ({
        get anchorNode() {
          return getAnchorNode()
        },
        get focusNode() {
          return getAnchorNode()
        },
        anchorOffset: 0,
        focusOffset: 0,
        get isCollapsed() {
          return true
        },
        get rangeCount() {
          return 1
        },
        removeAllRanges: () => {},
        addRange: () => {},
        setBaseAndExtent: () => {},
        getRangeAt: () => ({}) as Range,
        toString: () => '',
      }) as unknown as Selection,
  )

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 20,
    height: 20,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)

  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    value: 0,
  })

  const contextValue = createHostIntegrationValue()

  mockComposerContext(editor)
  const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')

  render(
    <InklingHostIntegrationProvider value={contextValue}>
      <SlashCardMenuPlugin />
    </InklingHostIntegrationProvider>,
  )

  return { editor, rootElement, dispatchCommandSpy }
}

function selectedMenuIndex(): string | null | undefined {
  return document.querySelector('[data-inkling-cardmenu-selected="true"]')?.getAttribute('data-inkling-cardmenu-idx')
}

describe('SlashCardMenuPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('does not render the slash menu initially', async () => {
    await setupSlashPlugin()
    expect(document.querySelector('[data-inkling-slash-menu]')).not.toBeInTheDocument()
  })

  it('opens the slash menu when / is typed on an empty paragraph', async () => {
    await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).toBeInTheDocument()
    })

    expect(document.querySelector('[data-inkling-card-menu]')).toBeInTheDocument()
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('filters the menu when typing a query', async () => {
    const { editor } = await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await act(async () => {
      await updateEditor(editor, () => {
        const paragraph = $getRoot().getFirstChild()
        if ($isElementNode(paragraph)) {
          paragraph.clear()
          paragraph.append($createTextNode('/image'))
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Image')).toBeInTheDocument()
    })

    expect(screen.queryByText('HTML')).not.toBeInTheDocument()
  })

  it('dispatches the insert command when selecting an item from the menu', async () => {
    const { editor, dispatchCommandSpy } = await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await act(async () => {
      await updateEditor(editor, () => {
        const paragraph = $getRoot().getFirstChild()
        if ($isElementNode(paragraph)) {
          paragraph.clear()
          paragraph.append($createTextNode('/html'))
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('HTML')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByText('HTML').click()
    })

    await waitFor(() => {
      expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_HTML_COMMAND, expect.any(Object))
    })
  })

  it('inserts the selected item from the flat list when Enter is pressed', async () => {
    const { editor, dispatchCommandSpy } = await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await act(async () => {
      await updateEditor(editor, () => {
        const paragraph = $getRoot().getFirstChild()
        if ($isElementNode(paragraph)) {
          paragraph.clear()
          paragraph.append($createTextNode('/html'))
        }
      })
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).toBeInTheDocument()
    })

    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    })

    await waitFor(() => {
      expect(dispatchCommandSpy).toHaveBeenCalledWith(INSERT_HTML_COMMAND, expect.any(Object))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).not.toBeInTheDocument()
    })
  })

  it('moves the rendered selection on arrow keys and wraps around at both ends', async () => {
    const { editor } = await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).toBeInTheDocument()
    })

    const itemCount = document.querySelectorAll('button[data-inkling-cardmenu-idx]').length
    expect(itemCount).toBeGreaterThan(1)
    expect(selectedMenuIndex()).toBe('0')

    await act(async () => {
      editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    await waitFor(() => {
      expect(selectedMenuIndex()).toBe('1')
    })

    await act(async () => {
      for (let i = 0; i < itemCount - 1; i++) {
        editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      }
    })
    await waitFor(() => {
      expect(selectedMenuIndex()).toBe('0')
    })

    await act(async () => {
      editor.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    })
    await waitFor(() => {
      expect(selectedMenuIndex()).toBe(String(itemCount - 1))
    })
  })

  it('resets the keyboard selection to the first item when the query rebuilds the menu', async () => {
    const { editor } = await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).toBeInTheDocument()
    })

    await act(async () => {
      editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    await waitFor(() => {
      expect(selectedMenuIndex()).toBe('2')
    })

    await act(async () => {
      await updateEditor(editor, () => {
        const paragraph = $getRoot().getFirstChild()
        if ($isElementNode(paragraph)) {
          paragraph.clear()
          paragraph.append($createTextNode('/image'))
        }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Image')).toBeInTheDocument()
      expect(selectedMenuIndex()).toBe('0')
    })
  })

  it('closes the slash menu when Escape is pressed', async () => {
    await setupSlashPlugin()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keypress', { key: '/', bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).toBeInTheDocument()
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-slash-menu]')).not.toBeInTheDocument()
    })
  })
})
