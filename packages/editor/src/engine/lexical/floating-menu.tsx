import type { LexicalEditor } from 'lexical'

import { $isCodeNode } from '@lexical/code'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Floating-layer infrastructure for the Lexical engine — the counterpart
 * of the tiptap `BubbleMenu` trio (PageBubbleMenu / TableBubbleMenu /
 * CodeBlockBubbleMenu). A small menu bar pinned above the selection or
 * the caret, positioned with the fixed-positioning + `bottom` trick so
 * no measuring pass is needed: the menu's bottom edge sits `offset` px
 * above the anchor rect.
 *
 * The kind detection mirrors the tiptap `shouldShow` rules:
 *
 *   - `selection` — non-collapsed range, editable, not inside a table /
 *     code block, not on an atom (decorator) node
 *   - `table` — caret inside a table cell (wins over `selection`)
 *   - `code` — caret inside a code block (wins over `selection`)
 */

export type FloatingMenuKind = 'selection' | 'table' | 'code'

export interface FloatingMenuAnchor {
  kind: FloatingMenuKind
  rect: DOMRect
}

function $detectKind(editor: LexicalEditor): FloatingMenuKind | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !editor.isEditable()) {
    // NodeSelection (an image / math block selected) never shows a bubble —
    // the tiptap `isAtom` gate.
    return null
  }
  const anchorNode = selection.anchor.getNode()

  // Ancestor scan — table cell and code block win over everything.
  let cursor: import('lexical').LexicalNode | null = anchorNode
  let inTable = false
  let inCode = false
  while (cursor !== null) {
    if (cursor.getType() === 'tablecell') {
      inTable = true
      break
    }
    if ($isCodeNode(cursor)) {
      inCode = true
      break
    }
    cursor = cursor.getParent()
  }
  if (inTable) {
    return 'table'
  }
  if (inCode) {
    return 'code'
  }
  if (!selection.isCollapsed()) {
    return 'selection'
  }
  return null
}

function anchorRectFor(editor: LexicalEditor, selection: import('lexical').RangeSelection): DOMRect | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null
  }
  const root = editor.getRootElement()
  if (root === null) {
    return null
  }
  const domSelection = window.getSelection()
  if (!selection.isCollapsed() && domSelection !== null && domSelection.rangeCount > 0) {
    const rect = domSelection.getRangeAt(0).getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return rect
    }
  }
  const element = editor.getElementByKey(selection.anchor.getNode().getKey())
  if (element === null) {
    return null
  }
  return element.getBoundingClientRect()
}

export interface FloatingMenuProps {
  editor: LexicalEditor
  children: React.ReactNode
  /** Vertical offset above the anchor rect (px). */
  offset?: number
  /** Optional external visibility gate (e.g. the link popover swaps the content). */
  hide?: boolean
}

export function FloatingMenu({ editor, children, offset = 8, hide }: FloatingMenuProps) {
  const [anchor, setAnchor] = useState<FloatingMenuAnchor | null>(null)
  const anchorRef = useRef<FloatingMenuAnchor | null>(null)

  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])

  useEffect(() => {
    const recompute = () => {
      editor.getEditorState().read(() => {
        const kind = $detectKind(editor)
        if (kind === null) {
          setAnchor(null)
          return
        }
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return
        }
        const rect = anchorRectFor(editor, selection)
        if (rect === null) {
          setAnchor(null)
          return
        }
        setAnchor((prev) =>
          prev !== null && prev.kind === kind && prev.rect.left === rect.left && prev.rect.top === rect.top
            ? prev
            : { kind, rect },
        )
      })
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
      editor.registerUpdateListener(recompute),
    )
  }, [editor])

  if (anchor === null || hide === true || typeof document === 'undefined') {
    return null
  }

  const { rect } = anchor

  return createPortal(
    <div
      className="fixed z-50 rounded-xl border bg-popover text-popover-foreground shadow-md"
      style={{
        bottom: Math.max(4, window.innerHeight - rect.top + offset),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
      }}
      onMouseDownCapture={(event) => {
        // Keep editor focus inside the menu's own form fields; steal the
        // mousedown otherwise so the selection survives the click.
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('input, textarea, select, label, [contenteditable="true"]') !== null
        ) {
          return
        }
        event.preventDefault()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
