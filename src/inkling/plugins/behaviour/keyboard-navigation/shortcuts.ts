import type { LexicalEditor } from 'lexical'

import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, $isQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
} from 'lexical'

import { $createAsideNode, $isAsideNode } from '@/inkling/nodes/AsideNode'
import { $selectDecoratorNode } from '@/inkling/utils'

/**
 * The keyboard-shortcut table: each entry owns one key shape. `matches` is the
 * pure key-shape test; `run` is the editor surgery and may decline by returning
 * false, letting the browser type the key normally. The registration loop stops
 * at the first matching entry, so `matches` predicates must stay mutually
 * exclusive.
 */
export interface KeyboardShortcut {
  /** The pure key-shape test — no editor reads. */
  matches: (event: KeyboardEvent) => boolean
  /** The editor surgery; returns true when the event is fully consumed. */
  run: (editor: LexicalEditor, event: KeyboardEvent) => boolean
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

/** meta+ArrowUp/Down on macOS jumps the caret (or node selection) to the document edges. */
const documentEdgeJump: KeyboardShortcut = {
  matches: ({ metaKey, key }) => metaKey && (key === 'ArrowUp' || key === 'ArrowDown'),
  run: (_editor, event) => {
    const selection = $getSelection()
    const isNodeSelected = $isNodeSelection(selection)
    const firstChild = $getRoot().getFirstChild()
    const lastChild = $getRoot().getLastChild()
    const hasCardAtStart = firstChild !== null && $isDecoratorNode(firstChild)
    const hasCardAtEnd = lastChild !== null && $isDecoratorNode(lastChild)

    if (!isNodeSelected && !hasCardAtStart && !hasCardAtEnd) {
      return false
    }

    event.preventDefault()

    if (event.key === 'ArrowDown' && lastChild !== null) {
      if ($isDecoratorNode(lastChild)) {
        $selectDecoratorNode(lastChild)
      } else {
        lastChild.selectEnd()
      }
      return true
    }

    if (event.key === 'ArrowUp' && firstChild !== null) {
      if ($isDecoratorNode(firstChild)) {
        $selectDecoratorNode(firstChild)
      } else {
        firstChild.selectStart()
      }
      return true
    }

    return false
  },
}

/** ctrl+Q cycles the block type: paragraph → quote → aside → paragraph. */
const quoteAsideCycle: KeyboardShortcut = {
  matches: ({ ctrlKey, code }) => ctrlKey && code === 'KeyQ',
  run: (_editor, event) => {
    // prevent the browser's quit binding
    event.preventDefault()

    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      const firstNode = selection.anchor.getNode().getTopLevelElement()

      if ($isParagraphNode(firstNode)) {
        $setBlocksType(selection, () => $createQuoteNode())
      } else if ($isQuoteNode(firstNode)) {
        $setBlocksType(selection, () => $createAsideNode())
      } else if ($isAsideNode(firstNode)) {
        $setBlocksType(selection, () => $createParagraphNode())
      }
    }
    return false
  },
}

/** ctrl/cmd+alt+H toggles highlight. */
const highlightToggle: KeyboardShortcut = {
  matches: ({ ctrlKey, metaKey, altKey, code }) => (ctrlKey || metaKey) && altKey && code === 'KeyH',
  run: (editor, event) => {
    event.preventDefault()
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')
    return true
  },
}

// The one inline-code dispatch shared by ctrl+shift+K and the backtick chord, so
// both stay on exactly the same FORMAT_TEXT_COMMAND path.
function dispatchCodeFormat(editor: LexicalEditor): true {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
  return true
}

/** ctrl+shift+K formats the selection as code. */
const codeFormat: KeyboardShortcut = {
  matches: ({ ctrlKey, shiftKey, code }) => ctrlKey && shiftKey && code === 'KeyK',
  run: (editor) => dispatchCodeFormat(editor),
}

/**
 * Typing an unmodified backtick over a non-collapsed selection toggles inline
 * code through the same FORMAT_TEXT_COMMAND path as ctrl+shift+K. A collapsed
 * selection, a modifier chord (Shift included — some layouts produce a backtick
 * with Shift), and IME composition fall through so the browser types normally.
 * CodeMirror owns its own backtick: the key-down passthrough consumes
 * card-inner events before this table sees them.
 */
const codeSelectionBacktick: KeyboardShortcut = {
  matches: ({ key, altKey, ctrlKey, metaKey, shiftKey, isComposing }) =>
    key === '`' && !altKey && !ctrlKey && !metaKey && !shiftKey && !isComposing,
  run: (editor, event) => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      return false
    }

    event.preventDefault()
    return dispatchCodeFormat(editor)
  },
}

/** ctrl+alt+U strikethroughs (cmd+alt+U launches the browser source view). */
const strikethroughFormat: KeyboardShortcut = {
  matches: ({ ctrlKey, altKey, code }) => ctrlKey && altKey && code === 'KeyU',
  run: (editor) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
    return true
  },
}

/** ctrl+alt+1..6 turns the block into that heading level. */
const headingFormat: KeyboardShortcut = {
  matches: ({ ctrlKey, altKey, key }) => ctrlKey && altKey && /^[1-6]$/.test(key),
  run: (_editor, event) => {
    event.preventDefault()

    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      const headingIndex = Number(event.key) - 1
      $setBlocksType(selection, () => $createHeadingNode(HEADING_TAGS[headingIndex]))
    }
    return false
  },
}

/** ctrl+L toggles the list (alt → ordered); inside a list it unwraps to a flush paragraph. */
const listToggle: KeyboardShortcut = {
  matches: ({ ctrlKey, code }) => ctrlKey && code === 'KeyL',
  run: (editor, event) => {
    event.preventDefault()

    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      const firstNode = selection.anchor.getNode().getTopLevelElement()

      if ($isListNode(firstNode)) {
        editor.update(() => {
          const pNode = $createParagraphNode()
          $setBlocksType(selection, () => pNode)

          // Lexical auto-indents the paragraph to the list item's level; indented paragraphs are not allowed
          pNode.setIndent(0)
        })
      } else if (event.altKey) {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      } else {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      }
    }
    return false
  },
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  documentEdgeJump,
  quoteAsideCycle,
  highlightToggle,
  codeFormat,
  codeSelectionBacktick,
  strikethroughFormat,
  headingFormat,
  listToggle,
]
