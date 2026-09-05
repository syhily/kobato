import { act, render, screen, waitFor } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { updateEditor } from '#/utils/test-editor'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import { INSERT_HTML_COMMAND } from '@/nodes/HtmlNode'
import PlusCardMenuPlugin from '@/plugins/PlusCardMenuPlugin'

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

async function setupPlusPlugin() {
  const editor = createTestEditor()
  const rootElement = document.createElement('div')
  rootElement.setAttribute('contenteditable', 'true')
  document.body.appendChild(rootElement)
  editor.setRootElement(rootElement)

  let paragraphElement: Element | null = null

  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode()
    paragraph.append($createTextNode(''))
    $getRoot().append(paragraph)
    paragraph.select()
  })

  paragraphElement = rootElement.querySelector('p')

  const contextValue = createHostIntegrationValue()

  mockComposerContext(editor)
  const dispatchCommandSpy = vi.spyOn(editor, 'dispatchCommand')

  render(
    <InklingHostIntegrationProvider value={contextValue}>
      <PlusCardMenuPlugin />
    </InklingHostIntegrationProvider>,
  )

  return { editor, rootElement, paragraphElement, dispatchCommandSpy }
}

function mockSelectionWithParagraph(paragraphElement: Element | null) {
  return vi.spyOn(window, 'getSelection').mockReturnValue({
    anchorNode: paragraphElement,
    anchorOffset: 0,
    focusNode: paragraphElement,
    focusOffset: 0,
    isCollapsed: true,
    rangeCount: 1,
    removeAllRanges: () => {},
    addRange: () => {},
    getRangeAt: () => ({}) as Range,
    toString: () => '',
  } as unknown as Selection)
}

describe('PlusCardMenuPlugin', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not render the plus button initially', async () => {
    await setupPlusPlugin()
    expect(document.querySelector('[data-inkling-plus-button]')).not.toBeInTheDocument()
  })

  it('shows the plus button when the cursor is on an empty paragraph', async () => {
    const { editor, paragraphElement } = await setupPlusPlugin()
    const selectionSpy = mockSelectionWithParagraph(paragraphElement)

    await act(async () => {
      await updateEditor(editor, () => {
        // no-op update to trigger the listener
      })
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-plus-button]')).toBeInTheDocument()
    })

    selectionSpy.mockRestore()
  })

  it('opens the card menu when the plus button is clicked', async () => {
    const { editor, paragraphElement } = await setupPlusPlugin()
    const selectionSpy = mockSelectionWithParagraph(paragraphElement)

    await act(async () => {
      await updateEditor(editor, () => {
        // no-op update to trigger the listener
      })
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-plus-button]')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByLabelText('Add a card').click()
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-plus-menu]')).toBeInTheDocument()
    })

    expect(document.querySelector('[data-inkling-card-menu]')).toBeInTheDocument()

    selectionSpy.mockRestore()
  })

  it('dispatches the insert command when selecting an item from the menu', async () => {
    const { editor, paragraphElement, dispatchCommandSpy } = await setupPlusPlugin()
    const selectionSpy = mockSelectionWithParagraph(paragraphElement)

    await act(async () => {
      await updateEditor(editor, () => {
        // no-op update to trigger the listener
      })
    })

    await waitFor(() => {
      expect(document.querySelector('[data-inkling-plus-button]')).toBeInTheDocument()
    })

    await act(async () => {
      screen.getByLabelText('Add a card').click()
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

    selectionSpy.mockRestore()
  })
})
