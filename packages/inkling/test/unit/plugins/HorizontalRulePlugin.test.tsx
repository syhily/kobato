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
import React, { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { tick, updateEditor } from '#/utils/test-editor'
import { $isHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { HorizontalRulePlugin } from '@/plugins/HorizontalRulePlugin'

// Plan 052 Step 1: characterization pins for the hand-rolled HR update
// listener, mounted with NO markdown transformers so the listener is the only
// `---` → HR path. They pin CURRENT behavior ahead of the card-shortcut seam
// migration (the undo pin was updated in step 5, when the historic-tag gate
// fixed the re-fire it had recorded). The `editor.isComposing()` IME bail is
// not simulable in jsdom (no composition events) and has no e2e coverage
// either; the guard is carried verbatim through the seam.

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [HorizontalRuleNode],
    onError: () => {},
    theme: {},
  })
}

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: LexicalEditor }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
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

  // The listener bails unless the native selection anchor is a text node
  // inside the root element. jsdom does not track the native caret, so mirror
  // a browser: resolve the anchor from the last committed Lexical selection.
  // Registered BEFORE the plugin so the key is fresh when the plugin's
  // listener runs on the same update.
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
      // Lexical's selection reconciler writes through the native Selection on
      // forced syncs (e.g. undo); no-op the write to keep jsdom quiet
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
    for (const char of text) {
      await act(async () => {
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, char)
      })
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
      // the paragraph is REPLACED by the rule; the next sibling survives
      const after = root.getChildAtIndex(1)
      expect($isParagraphNode(after)).toBe(true)
      expect(after?.getKey()).toBe(afterKey)
      expect(after?.getTextContent()).toBe('after')
      // line.selectNext(): the caret lands at the start of the surviving paragraph
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
      // the hand-rolled path creates a FRESH paragraph where the markdown
      // transformer path keeps the emptied one — pinned as data for the
      // plan-052 seam
      expect(trailing?.getKey()).not.toBe(paragraphKey)
      // line.selectNext(): the caret lands on the fresh trailing paragraph
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
    // Plan 052 step 5 (the sanctioned pin update): before the dirty-set/tag
    // gate, the listener had no historic-tag skip and RE-FIRED on the undo
    // update — undo of the HR creation resurrected the card (the step-1
    // version of this pin expected ['horizontalrule', 'paragraph'] here).
    // With the gate, the restored '---' paragraph stays.
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
