import type { LexicalEditor, RangeSelection } from 'lexical'

import { getHistoryAvailability } from '@kobato/editor/engine/lexical/history'
import { $isCodeNode } from '@lexical/code'
import { LinkNode } from '@lexical/link'
import { ListNode } from '@lexical/list'
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $isTableSelection } from '@lexical/table'
import { $getNearestNodeOfType, mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useEffect, useState } from 'react'

/**
 * Selection-derived toolbar state for the Lexical engine — the
 * counterpart of the tiptap toolbar's `editor.isActive(...)` reads.
 * Computed inside `editor.getEditorState().read` on every selection
 * change / update / read-only flip, memoized by JSON so unrelated
 * updates do not re-render the toolbar.
 *
 * The state is the single source of truth for button `active` / `disabled`
 * rendering AND for the `canInsertFootnoteMark` equivalent: the footnote
 * button disables inside tables and code blocks, mirroring
 * `insert-inline-footnote.ts`'s guard (the PT bridge rejects footnote
 * refs in those containers).
 */

export type ToolbarBlockStyle = 'normal' | 'h2' | 'h3' | 'h4' | 'h5' | 'blockquote' | 'codeBlock'
export type ToolbarAlign = 'left' | 'center' | 'right'

export interface ToolbarSelectionState {
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrikethrough: boolean
  isCode: boolean
  /** Active block style at the caret (`normal` fallback, h1/h6 map to normal like the tiptap engine). */
  blockStyle: ToolbarBlockStyle
  /** Active alignment; `left` covers the default (unset) format. */
  align: ToolbarAlign
  isBulletList: boolean
  isOrderedList: boolean
  isLink: boolean
  canUndo: boolean
  canRedo: boolean
  /** `canInsertFootnoteMark` equivalent — false inside tables / code blocks / read-only. */
  canInsertFootnote: boolean
}

/** Find the top-level block (direct child of root) containing the given node. */
function $getTopLevelBlock(node: import('lexical').LexicalNode | null): import('lexical').ElementNode | null {
  let current: import('lexical').LexicalNode | null = node
  let top: import('lexical').ElementNode | null = null
  while (current !== null) {
    const parent = current.getParent()
    if (parent === null) {
      break
    }
    if (parent.getParent() === null && $isElementNode(current)) {
      // `parent` is the root — `current` is the top-level block.
      top = current
      break
    }
    current = parent
  }
  return top
}

function $insideTableOrCode(node: import('lexical').LexicalNode): boolean {
  let cursor: import('lexical').LexicalNode | null = node
  while (cursor !== null) {
    if ($isCodeNode(cursor) || cursor.getType() === 'tablecell') {
      return true
    }
    cursor = cursor.getParent()
  }
  return false
}

function $computeSelectionState(editor: LexicalEditor): ToolbarSelectionState {
  const history = getHistoryAvailability(editor)

  const base: ToolbarSelectionState = {
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    isCode: false,
    blockStyle: 'normal',
    align: 'left',
    isBulletList: false,
    isOrderedList: false,
    isLink: false,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    canInsertFootnote: editor.isEditable(),
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection) && !$isTableSelection(selection)) {
    return base
  }

  // TableSelection is treated as plain (table-internal format is out of
  // scope, same as the tiptap engine hiding its bubble inside tables).
  if (!$isRangeSelection(selection)) {
    base.canInsertFootnote = false
    return base
  }
  const range = selection as RangeSelection

  base.isBold = range.hasFormat('bold')
  base.isItalic = range.hasFormat('italic')
  base.isUnderline = range.hasFormat('underline')
  base.isStrikethrough = range.hasFormat('strikethrough')
  base.isCode = range.hasFormat('code')

  const anchorNode = range.anchor.getNode()

  // Block style — walk up from the anchor to the top-level block.
  const topBlock = $getTopLevelBlock(anchorNode)
  if (topBlock !== null) {
    if ($isCodeNode(topBlock)) {
      base.blockStyle = 'codeBlock'
    } else if ($isQuoteNode(topBlock)) {
      base.blockStyle = 'blockquote'
    } else if ($isHeadingNode(topBlock)) {
      const tag = topBlock.getTag()
      if (tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5') {
        base.blockStyle = tag
      }
    } else {
      const format = topBlock.getFormatType()
      if (format === 'center') {
        base.align = 'center'
      } else if (format === 'right') {
        base.align = 'right'
      }
    }
  }

  // Lists — nearest list ancestor of the anchor decides the type.
  const list = $getNearestNodeOfType(anchorNode, ListNode)
  if (list !== null) {
    base.isBulletList = list.getListType() === 'bullet'
    base.isOrderedList = list.getListType() === 'number'
  }

  // Link — nearest link ancestor of the anchor (collapsed caret inside a link counts).
  base.isLink = $getNearestNodeOfType(anchorNode, LinkNode) !== null

  base.canInsertFootnote = editor.isEditable() && !$insideTableOrCode(anchorNode)

  return base
}

/** Full toolbar state computation — must run inside a read context. */
export function computeToolbarSelectionState(editor: LexicalEditor): ToolbarSelectionState {
  return editor.getEditorState().read(() => $computeSelectionState(editor))
}

const EMPTY: ToolbarSelectionState = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikethrough: false,
  isCode: false,
  blockStyle: 'normal',
  align: 'left',
  isBulletList: false,
  isOrderedList: false,
  isLink: false,
  canUndo: false,
  canRedo: false,
  canInsertFootnote: false,
}

function stateKey(state: ToolbarSelectionState): string {
  return JSON.stringify(state)
}

/**
 * Reactive toolbar state — re-computes on selection changes, editor
 * updates (undo/redo stacks) and read-only flips. Returns a stable
 * reference while the state is unchanged, so the toolbar does not
 * re-render on unrelated edits.
 */
export function useToolbarSelectionState(editor: LexicalEditor | null): ToolbarSelectionState {
  const [state, setState] = useState<ToolbarSelectionState>(() =>
    editor === null ? EMPTY : computeToolbarSelectionState(editor),
  )

  useEffect(() => {
    if (editor === null) {
      return
    }
    const recompute = () => {
      const next = computeToolbarSelectionState(editor)
      setState((prev) => (stateKey(prev) === stateKey(next) ? prev : next))
    }
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          recompute()
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerEditableListener(recompute),
      // History availability (undo/redo stacks) is published by another
      // update listener that may run AFTER this one in the same flush —
      // defer the recompute so `canUndo`/`canRedo` read fresh values.
      editor.registerUpdateListener(() => {
        queueMicrotask(recompute)
      }),
    )
  }, [editor])

  return state
}
