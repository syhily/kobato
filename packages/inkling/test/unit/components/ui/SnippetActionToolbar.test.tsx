import { fireEvent, render, screen } from '@testing-library/react'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { createHostIntegrationValue } from '#/utils/host-integration-context'
import { updateEditor } from '#/utils/test-editor'
import { SnippetActionToolbar } from '@/components/ui/SnippetActionToolbar'
import { InklingHostIntegrationProvider } from '@/context/InklingHostIntegrationContext'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', onError: () => {} })
}

function selectText(editor: LexicalEditor, text: string): Promise<void> {
  return updateEditor(editor, () => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    const textNode = $createTextNode(text)
    paragraph.append(textNode)
    root.append(paragraph)
    textNode.select(0, text.length)
  })
}

function renderToolbar(
  createSnippet: ((args: { name: string; value: string }) => void) | undefined,
  onClose: () => void,
) {
  const composerValue = createHostIntegrationValue({
    cardConfig: { createSnippet, snippets: [] as Array<{ name: string; value: string }> },
  })
  return render(
    <InklingHostIntegrationProvider value={composerValue}>
      <SnippetActionToolbar onClose={onClose} />
    </InklingHostIntegrationProvider>,
  )
}

describe('SnippetActionToolbar', () => {
  let editor: LexicalEditor

  beforeEach(async () => {
    editor = createTestEditor()
    mockComposerContext(editor)
  })

  it('saves the current selection as a snippet', async () => {
    await selectText(editor, 'hello snippet')
    const createSnippet = vi.fn()
    const onClose = vi.fn()

    renderToolbar(createSnippet, onClose)

    fireEvent.change(screen.getByTestId('snippet-name'), { target: { value: 'My snippet' } })
    fireEvent.keyDown(screen.getByTestId('snippet-name'), { key: 'Enter' })

    expect(createSnippet).toHaveBeenCalledTimes(1)
    const { name, value } = createSnippet.mock.calls[0]![0] as { name: string; value: string }
    expect(name).toBe('My snippet')

    const parsed = JSON.parse(value) as { nodes: Array<{ type?: string; text?: string }> }
    expect(parsed.nodes.length).toBeGreaterThan(0)
    expect(parsed.nodes.some((node) => node.text === 'hello snippet')).toBe(true)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no snippet name is given', async () => {
    await selectText(editor, 'hello snippet')
    const createSnippet = vi.fn()

    renderToolbar(createSnippet, vi.fn())

    fireEvent.keyDown(screen.getByTestId('snippet-name'), { key: 'Enter' })

    expect(createSnippet).not.toHaveBeenCalled()
  })

  it('closes without creating when createSnippet is not configured', async () => {
    await selectText(editor, 'hello snippet')
    const onClose = vi.fn()

    renderToolbar(undefined, onClose)

    fireEvent.change(screen.getByTestId('snippet-name'), { target: { value: 'My snippet' } })
    fireEvent.keyDown(screen.getByTestId('snippet-name'), { key: 'Enter' })

    expect(onClose).not.toHaveBeenCalled()
  })
})
