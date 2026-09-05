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

import { $createAsideNode, $isAsideNode } from '@/nodes/AsideNode'
import { $selectDecoratorNode } from '@/utils'

/**
 * The modifier-key shortcut table (round 3, C7): each entry owns one chord —
 * `matches` is the pure key test, `run` the editor surgery. The registration
 * loop in modifier.ts walks the table in order and stops at the first match,
 * so entries stay independent of one another.
 */
export interface ModifierShortcut {
  /** The pure chord test — no editor reads. */
  matches: (event: KeyboardEvent) => boolean
  /** The editor surgery; returns true when the event is fully consumed. */
  run: (editor: LexicalEditor, event: KeyboardEvent) => boolean
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

/** meta+ArrowUp/Down on macOS jumps the caret (or node selection) to the document edges. */
const documentEdgeJump: ModifierShortcut = {
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
const quoteAsideCycle: ModifierShortcut = {
  matches: ({ ctrlKey, code }) => ctrlKey && code === 'KeyQ',
  run: (_editor, event) => {
    // avoid quit behaviour
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
const highlightToggle: ModifierShortcut = {
  matches: ({ ctrlKey, metaKey, altKey, code }) => (ctrlKey || metaKey) && altKey && code === 'KeyH',
  run: (editor, event) => {
    event.preventDefault()
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')
    return true
  },
}

/** ctrl+shift+K formats the selection as code. */
const codeFormat: ModifierShortcut = {
  matches: ({ ctrlKey, shiftKey, code }) => ctrlKey && shiftKey && code === 'KeyK',
  run: (editor) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
    return true
  },
}

/** ctrl+alt+U strikethroughs (cmd+alt+U launches the browser source view). */
const strikethroughFormat: ModifierShortcut = {
  matches: ({ ctrlKey, altKey, code }) => ctrlKey && altKey && code === 'KeyU',
  run: (editor) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
    return true
  },
}

/** ctrl+alt+1..6 turns the block into that heading level. */
const headingFormat: ModifierShortcut = {
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
const listToggle: ModifierShortcut = {
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

          // Lexical will automatically indent the paragraph node to the
          // list item level but we don't allow indented paragraphs
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

export const MODIFIER_SHORTCUTS: ModifierShortcut[] = [
  documentEdgeJump,
  quoteAsideCycle,
  highlightToggle,
  codeFormat,
  strikethroughFormat,
  headingFormat,
  listToggle,
]
