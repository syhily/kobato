import {
  $createListItemNode,
  $createListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@lexical/list'
import { $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  createEditor,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type TextFormatType,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { KeyboardNavigationDeps } from '@/plugins/behaviour/keyboard-navigation/types'

import { tick } from '#/utils/test-editor'
import { $isAsideNode, AsideNode } from '@/nodes/AsideNode'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { registerModifierCommand } from '@/plugins/behaviour/keyboard-navigation/modifier'

const deps: KeyboardNavigationDeps = {
  store: createCardSelectionStore(),
}

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [AsideNode, HeadingNode, QuoteNode, ListNode, ListItemNode, HorizontalRuleNode],
    onError: (error) => {
      throw error
    },
  })
}

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

/** Appends a paragraph carrying `text` and collapses the caret inside it. */
function appendParagraphWithCaret(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const paragraph = $createParagraphNode()
    paragraph.append($createTextNode(text))
    $getRoot().append(paragraph)
    paragraph.select(1, 1)
  })
}

describe('registerModifierCommand', () => {
  let editor: LexicalEditor
  let fallthrough: ReturnType<typeof vi.fn<(event: KeyboardEvent) => boolean>>

  beforeEach(() => {
    editor = createTestEditor()
    registerModifierCommand(editor, deps)
    // same-priority listener registered afterwards only runs when no
    // shortcut consumes the event (returns true)
    fallthrough = vi.fn<(event: KeyboardEvent) => boolean>(() => false)
    editor.registerCommand(KEY_DOWN_COMMAND, fallthrough, COMMAND_PRIORITY_LOW)
  })

  describe('format shortcuts', () => {
    let formats: TextFormatType[]

    beforeEach(() => {
      formats = []
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (format) => {
          formats.push(format)
          return true
        },
        COMMAND_PRIORITY_CRITICAL,
      )
    })

    it('ctrl/cmd+alt+H dispatches a highlight format and consumes the event', () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyH', ctrlKey: true, altKey: true }))
      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyH', metaKey: true, altKey: true }))

      expect(formats).toEqual(['highlight', 'highlight'])
      expect(fallthrough).not.toHaveBeenCalled()
    })

    it('ctrl+shift+K dispatches a code format and consumes the event', () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyK', ctrlKey: true, shiftKey: true }))

      expect(formats).toEqual(['code'])
      expect(fallthrough).not.toHaveBeenCalled()
    })

    it('ctrl+alt+U dispatches a strikethrough format and consumes the event', () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyU', ctrlKey: true, altKey: true }))

      expect(formats).toEqual(['strikethrough'])
      expect(fallthrough).not.toHaveBeenCalled()
    })

    it('plain typing falls through untouched', () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyK', key: 'k' }))

      expect(formats).toEqual([])
      expect(fallthrough).toHaveBeenCalledTimes(1)
    })
  })

  describe('heading shortcut', () => {
    it('ctrl+alt+1..6 turns the block into that heading level', async () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ key: '3', ctrlKey: true, altKey: true }))
      // Lexical 0.46 commits updates on a microtask — tick() drains the queue
      // after each dispatch so state assertions see the settled editor
      await tick()

      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild()
        expect($isHeadingNode(first)).toBe(true)
        if ($isHeadingNode(first)) {
          expect(first.getTag()).toBe('h3')
        }
      })
    })
  })

  describe('quote/aside cycle', () => {
    it('ctrl+Q cycles paragraph → quote → aside → paragraph', async () => {
      appendParagraphWithCaret(editor, 'hello')

      const cycle = async () => {
        editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyQ', ctrlKey: true }))
        await tick()
        return editor.getEditorState().read(() => $getRoot().getFirstChild())
      }

      expect($isQuoteNode(await cycle())).toBe(true)
      expect($isAsideNode(await cycle())).toBe(true)
      expect($isParagraphNode(await cycle())).toBe(true)
    })
  })

  describe('list shortcut', () => {
    it('ctrl+L outside a list dispatches the unordered-list command', () => {
      appendParagraphWithCaret(editor, 'hello')

      const inserts: string[] = []
      editor.registerCommand(
        INSERT_UNORDERED_LIST_COMMAND,
        () => {
          inserts.push('unordered')
          return true
        },
        COMMAND_PRIORITY_CRITICAL,
      )
      editor.registerCommand(
        INSERT_ORDERED_LIST_COMMAND,
        () => {
          inserts.push('ordered')
          return true
        },
        COMMAND_PRIORITY_CRITICAL,
      )

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyL', ctrlKey: true }))
      expect(inserts).toEqual(['unordered'])

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyL', ctrlKey: true, altKey: true }))
      expect(inserts).toEqual(['unordered', 'ordered'])
    })

    it('ctrl+L inside a list unwraps to a flush paragraph', async () => {
      editor.update(() => {
        const list = $createListNode('bullet')
        const item = $createListItemNode()
        item.append($createTextNode('hello'))
        list.append(item)
        $getRoot().append(list)
        item.select(1, 1)
      })

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ code: 'KeyL', ctrlKey: true }))
      await tick()

      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild()
        expect($isParagraphNode(first)).toBe(true)
        if ($isParagraphNode(first)) {
          expect(first.getIndent()).toBe(0)
        }
      })
    })
  })

  describe('document edge jump', () => {
    it('meta+ArrowDown selects a trailing card as a node selection', async () => {
      editor.update(() => {
        $getRoot().append($createParagraphNode(), $createHorizontalRuleNode())
      })

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ key: 'ArrowDown', metaKey: true }))
      await tick()

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
      })
      expect(fallthrough).not.toHaveBeenCalled()
    })

    it('meta+ArrowUp moves the caret into a leading paragraph', async () => {
      editor.update(() => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('hello'))
        $getRoot().append(paragraph, $createHorizontalRuleNode())
      })

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ key: 'ArrowUp', metaKey: true }))
      await tick()

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.anchor.getNode().getTextContent()).toBe('hello')
        }
      })
      expect(fallthrough).not.toHaveBeenCalled()
    })

    it('falls through when the document has no card at either edge', () => {
      appendParagraphWithCaret(editor, 'hello')

      editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent({ key: 'ArrowDown', metaKey: true }))

      expect(fallthrough).toHaveBeenCalledTimes(1)
    })
  })
})
