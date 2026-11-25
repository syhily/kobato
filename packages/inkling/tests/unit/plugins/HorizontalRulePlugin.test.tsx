import { $isHorizontalRuleNode, HorizontalRuleNode } from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
import { HorizontalRulePlugin } from '@kobato/inkling-internal/plugins/HorizontalRulePlugin'
import { tick, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HistoryPlugin, createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { registerRichText } from '@lexical/rich-text'
import { act, renderHook } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  UNDO_COMMAND,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { type ReactNode, type ContextType, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [HorizontalRuleNode],
    onError: () => {},
    theme: {},
  })
}

function TestWrapper({ children, editor }: { children: ReactNode; editor: LexicalEditor }) {
  const contextValue = useMemo<ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

describe('HorizontalRulePlugin shortcut listener', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function trackNativeSelection() {
    let lastAnchorKey: string | null = null
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        lastAnchorKey = $isRangeSelection(selection) ? selection.anchor.key : null
      })
    })
    vi.spyOn(window, 'getSelection').mockImplementation(() => {
      const dom = lastAnchorKey ? editor.getElementByKey(lastAnchorKey) : null
      return {
        anchorNode: dom?.firstChild ?? null,
        setBaseAndExtent: () => {},
      } as unknown as Selection
    })
  }

  async function mountPlugin() {
    const historyState = createEmptyHistoryState()
    await act(async () => {
      renderHook(() => HistoryPlugin({ externalHistoryState: historyState }), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
      renderHook(() => HorizontalRulePlugin(), {
        wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
      })
    })
    registerRichText(editor)
  }

  async function setContent(texts: string[]): Promise<string[]> {
    const keys: string[] = []
    await updateEditor(editor, () => {
      for (const text of texts) {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(text))
        $getRoot().append(paragraph)
        keys.push(paragraph.getKey())
      }
      const first = $getRoot().getFirstChild()
      if ($isParagraphNode(first)) {
        first.select()
      }
    })
    return keys
  }

  async function typeText(text: string) {
    const typeChar = (char: string) =>
      act(async () => {
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, char)
      })
    for (const char of text) {
      await typeChar(char)
      await tick()
    }
  }

  function rootChildTypes(): string[] {
    return editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType()),
    )
  }

  it('transforms a typed --- paragraph into an HR card when a next sibling exists', async () => {
    trackNativeSelection()
    await mountPlugin()
    const [, afterKey] = await setContent(['', 'after'])

    await typeText('---')

    expect(rootChildTypes()).toEqual(['horizontalrule', 'paragraph'])
    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect($isHorizontalRuleNode(root.getFirstChild())).toBe(true)
      const after = root.getChildAtIndex(1)
      expect($isParagraphNode(after)).toBe(true)
      expect(after?.getKey()).toBe(afterKey)
      expect(after?.getTextContent()).toBe('after')
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if (!$isRangeSelection(selection)) {
        throw new Error('Expected a range selection')
      }
      expect(selection.anchor.offset).toBe(0)
      expect(selection.anchor.getNode().getTopLevelElement()?.getKey()).toBe(afterKey)
    })
  })

  it('creates a fresh paragraph after the rule when the --- paragraph is the last block', async () => {
    trackNativeSelection()
    await mountPlugin()
    const [paragraphKey] = await setContent([''])

    await typeText('---')

    expect(rootChildTypes()).toEqual(['horizontalrule', 'paragraph'])
    editor.getEditorState().read(() => {
      const root = $getRoot()
      const trailing = root.getChildAtIndex(1)
      expect($isParagraphNode(trailing)).toBe(true)
      expect(trailing?.getTextContent()).toBe('')
      expect(trailing?.getKey()).not.toBe(paragraphKey)
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if (!$isRangeSelection(selection)) {
        throw new Error('Expected a range selection')
      }
      expect(selection.anchor.getNode().getTopLevelElement()?.getKey()).toBe(trailing?.getKey())
    })
  })

  it.each(['***', '___'])('transforms a typed %s paragraph into an HR card', async (marker) => {
    trackNativeSelection()
    await mountPlugin()
    await setContent([''])

    await typeText(marker)

    expect(rootChildTypes()).toEqual(['horizontalrule', 'paragraph'])
  })

  it('does not transform text that merely contains dashes (a---b)', async () => {
    trackNativeSelection()
    await mountPlugin()
    await setContent([''])

    await typeText('a---b')

    expect(rootChildTypes()).toEqual(['paragraph'])
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('a---b')
  })

  it('keeps the restored --- paragraph on undo of the HR creation (historic-tag gate)', async () => {
    trackNativeSelection()
    await mountPlugin()
    await setContent([''])
    await typeText('---')
    expect(rootChildTypes()).toEqual(['horizontalrule', 'paragraph'])

    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await tick()

    expect(rootChildTypes()).toEqual(['paragraph'])
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('---')
  })
})
