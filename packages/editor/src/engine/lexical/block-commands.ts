import type { LexicalEditor } from 'lexical'

import { $createCodeNode, $isCodeNode } from '@lexical/code'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, $isQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $getSelection, $isRangeSelection, $createParagraphNode, FORMAT_ELEMENT_COMMAND } from 'lexical'

// Block-level formatting for the Lexical engine — the counterpart of the
// tiptap `style-helpers.ts` / toolbar chain commands. Paragraph / heading /
// quote / code-block conversions go through `$setBlocksType` with a
// factory (0.45 API — the old FORMAT_HEADING/FORMAT_PARAGRAPH commands
// no longer exist); alignment goes through `FORMAT_ELEMENT_COMMAND`
// (registered by the RichTextPlugin). The tiptap "style control never
// unwraps" semantics: applying `blockquote` / `codeBlock` while already
// inside one is a no-op (the toolbar button stays active; the slash
// menu's `paragraph` command is the way out).

export type BlockStyleValue = 'normal' | 'h2' | 'h3' | 'h4' | 'h5' | 'blockquote' | 'codeBlock'

function $applyBlockStyleToSelection(value: BlockStyleValue): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  switch (value) {
    case 'normal':
      $setBlocksType(selection, () => $createParagraphNode())
      return
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
      $setBlocksType(selection, () => $createHeadingNode(value))
      return
    case 'blockquote': {
      const anchor = selection.anchor.getNode()
      if ($isQuoteNode(anchor.getParent() ?? anchor)) {
        return
      }
      $setBlocksType(selection, () => $createQuoteNode())
      return
    }
    case 'codeBlock': {
      const anchor = selection.anchor.getNode()
      if ($isCodeNode(anchor.getParent() ?? anchor)) {
        return
      }
      $setBlocksType(selection, () => $createCodeNode())
      return
    }
  }
}

/** Apply a block style to the current selection (refocuses first, tiptap parity). */
export function applyBlockStyle(editor: LexicalEditor, value: BlockStyleValue): void {
  editor.focus()
  editor.update(() => $applyBlockStyleToSelection(value))
}

/** Apply an alignment to the current selection (`FORMAT_ELEMENT_COMMAND`, refocuses first). */
export function applyAlign(editor: LexicalEditor, value: 'left' | 'center' | 'right'): void {
  editor.focus()
  editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, value)
}

/** Insert a bullet list (converts an existing list of another type). */
export function insertBulletList(editor: LexicalEditor): void {
  editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
}

/** Insert an ordered list (converts an existing list of another type). */
export function insertOrderedList(editor: LexicalEditor): void {
  editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
}

/** Remove the list wrapping the selection. */
export function removeList(editor: LexicalEditor): void {
  editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
}
