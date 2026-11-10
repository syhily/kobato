import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HistoryPlugin, createEmptyHistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { registerRichText } from '@lexical/rich-text'
import { act, renderHook } from '@testing-library/react'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  createEditor,
  KEY_DOWN_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from 'lexical'
import React, { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import {
  firstTextKey,
  seedSelectionEditor,
  selectAcrossParagraphs,
  selectFirstText,
  selectText,
} from '#/inkling/utils/selection'
import { tick } from '#/inkling/utils/test-editor'
import { createCardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'
import { registerModifierCommand } from '@/inkling/plugins/behaviour/keyboard-navigation/modifier'
import { registerKeyboardNavigation } from '@/inkling/plugins/behaviour/registerKeyboardNavigation'

// Typing an unmodified backtick over a range selection formats it as inline
// code through the same FORMAT_TEXT_COMMAND path as ctrl+shift+K. These are
// real-editor specs: FormatText is
// wired by registerRichText, undo by the real HistoryPlugin, and the nested
// mount goes through the production registerKeyboardNavigation seam.

interface CreatedEditor {
  editor: LexicalEditor
  root: HTMLDivElement
}

function createTestEditor(parentEditor?: LexicalEditor): CreatedEditor {
  const editor = createEditor({
    namespace: 'test',
    onError: (error) => {
      throw error
    },
    parentEditor,
  })
  const root = document.createElement('div')
  root.setAttribute('contenteditable', 'true')
  document.body.appendChild(root)
  editor.setRootElement(root)
  registerRichText(editor)
  return { editor, root }
}

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: LexicalEditor }) {
  const value = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={value}>{children}</LexicalComposerContext.Provider>
}

function mountHistory(editor: LexicalEditor) {
  return renderHook(() => HistoryPlugin({ externalHistoryState: createEmptyHistoryState() }), {
    wrapper: ({ children }) => <TestWrapper editor={editor}>{children}</TestWrapper>,
  })
}

async function selectBackwards(editor: LexicalEditor, textNodeKey: string, length: number) {
  const size = editor.getEditorState().read(() => {
    const text = $getNodeByKey(textNodeKey)
    if (!$isTextNode(text)) {
      throw new Error('Expected a text node')
    }
    return text.getTextContentSize()
  })
  await selectText(editor, textNodeKey, size - length, size)
}

function backtickEvent(init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: '`',
    code: 'Backquote',
    bubbles: true,
    cancelable: true,
    ...init,
  })
}

async function dispatchKeyDown(editor: LexicalEditor, event: KeyboardEvent) {
  await act(async () => {
    editor.dispatchCommand(KEY_DOWN_COMMAND, event)
  })
  await tick()
}

function readSelection(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return null
    }
    return {
      text: selection.getTextContent(),
      codeFormats: selection
        .getNodes()
        .filter($isTextNode)
        .map((node) => node.hasFormat('code')),
    }
  })
}

describe('backtick over a selection', () => {
  const deps: KeyboardNavigationDeps = { store: createCardSelectionStore() }
  let editor: LexicalEditor
  let fallthrough: ReturnType<typeof vi.fn<(event: KeyboardEvent) => boolean>>
  let history: ReturnType<typeof mountHistory> | null

  beforeEach(async () => {
    document.body.innerHTML = ''
    history = null
    const created = createTestEditor()
    editor = created.editor
    registerModifierCommand(editor, deps)
    fallthrough = vi.fn<(event: KeyboardEvent) => boolean>(() => false)
    editor.registerCommand(KEY_DOWN_COMMAND, fallthrough, COMMAND_PRIORITY_LOW)
    await seedSelectionEditor(editor, ['hello world'])
  })

  afterEach(() => {
    history?.unmount()
    document.body.innerHTML = ''
  })

  it('formats a non-collapsed selection as inline code and keeps the selection', async () => {
    await selectBackwards(editor, firstTextKey(editor), 'world'.length)

    const event = backtickEvent()
    await dispatchKeyDown(editor, event)

    expect(event.defaultPrevented).toBe(true)
    expect(fallthrough).not.toHaveBeenCalled()
    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [true] })
  })

  it('toggles inline code back off on a second backtick', async () => {
    await selectBackwards(editor, firstTextKey(editor), 'world'.length)

    await dispatchKeyDown(editor, backtickEvent())
    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [true] })

    await dispatchKeyDown(editor, backtickEvent())
    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [false] })
  })

  it('leaves a collapsed selection to type a normal backtick', async () => {
    await selectFirstText(editor, 5, 5)

    const event = backtickEvent()
    await dispatchKeyDown(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(fallthrough).toHaveBeenCalledTimes(1)

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, '`')
    })
    await tick()

    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('hello` world')
  })

  it('does not claim alt, ctrl, meta, or shift chords', async () => {
    await selectBackwards(editor, firstTextKey(editor), 'world'.length)

    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      const event = backtickEvent(init)
      await dispatchKeyDown(editor, event)
      expect(event.defaultPrevented).toBe(false)
    }

    expect(fallthrough).toHaveBeenCalledTimes(4)
    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [false] })
  })

  it('does not claim a backtick that is part of an IME composition', async () => {
    await selectBackwards(editor, firstTextKey(editor), 'world'.length)

    const event = backtickEvent({ isComposing: true })
    await dispatchKeyDown(editor, event)

    expect(event.defaultPrevented).toBe(false)
    expect(fallthrough).toHaveBeenCalledTimes(1)
    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [false] })
  })

  it('formats a selection spanning paragraphs, like ctrl+shift+K', async () => {
    await seedSelectionEditor(editor, ['first para', 'second para'])
    await selectAcrossParagraphs(editor, 'first '.length, 'second para'.length)

    const event = backtickEvent()
    await dispatchKeyDown(editor, event)

    expect(event.defaultPrevented).toBe(true)
    const selection = readSelection(editor)
    expect(selection?.text).toBe('para\nsecond para')
    expect(selection?.codeFormats).toEqual([true, true])
  })

  it('undoes in one step back to the original selection', async () => {
    history = mountHistory(editor)
    await selectBackwards(editor, firstTextKey(editor), 'world'.length)

    await dispatchKeyDown(editor, backtickEvent())
    expect(readSelection(editor)?.codeFormats).toEqual([true])

    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await tick()

    expect(readSelection(editor)).toEqual({ text: 'world', codeFormats: [false] })
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('hello world')
  })

  it('works in a nested editor where keyboard navigation is mounted', async () => {
    const created = createTestEditor()
    const nested = createTestEditor(created.editor)
    registerKeyboardNavigation(nested.editor, { store: createCardSelectionStore(), isNested: true })
    await seedSelectionEditor(nested.editor, ['nested caption text'])
    await selectFirstText(nested.editor, 'nested '.length, 'nested caption'.length)

    const event = backtickEvent()
    await dispatchKeyDown(nested.editor, event)

    expect(event.defaultPrevented).toBe(true)
    expect(readSelection(nested.editor)).toEqual({ text: 'caption', codeFormats: [true] })

    created.root.remove()
  })

  it('leaves CodeMirror-owned keys alone when the full keyboard navigation is mounted', async () => {
    const topLevel = createTestEditor()
    registerKeyboardNavigation(topLevel.editor, { store: createCardSelectionStore() })
    await seedSelectionEditor(topLevel.editor, ['hello world'])
    await selectFirstText(topLevel.editor, 0, 'hello world'.length)

    const wrapper = document.createElement('div')
    wrapper.className = 'cm-editor'
    const content = document.createElement('div')
    content.className = 'cm-content'
    wrapper.appendChild(content)
    document.body.appendChild(wrapper)

    const event = backtickEvent()
    Object.defineProperty(event, 'target', { value: content })
    await act(async () => {
      topLevel.editor.dispatchCommand(KEY_DOWN_COMMAND, event)
    })
    await tick()

    expect(event.defaultPrevented).toBe(false)
    expect(readSelection(topLevel.editor)).toEqual({ text: 'hello world', codeFormats: [false] })

    wrapper.remove()
    topLevel.root.remove()
  })
})
