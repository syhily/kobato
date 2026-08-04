import type { LexicalEditor, LexicalNode } from 'lexical'

import { generateBlockKey } from '@kobato/shared/legacy-pt/utils'
import { $createInlineMathNode, $isInlineMathNode } from '@kobato/shared/lexical/nodes/inline-math-node'
import {
  $createTextNode,
  $generateNodesFromRawText,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  TextNode,
} from 'lexical'

/**
 * Inline-math input rules for the Lexical engine — the port of the tiptap
 * `MathInlineMark` input rule (`$…$` around a non-empty, single-line TeX
 * run) and its paste rule.
 *
 * Typing: a `TextNode` transform fires after the closing `$` lands; when
 * the node's text ends with an unescaped `$tex$` and the collapsed caret
 * sits right after it, the `$…$` span is replaced by an `InlineMathNode`
 * (prefix text preserved). The regex is the tiptap input regex verbatim
 * (`(^|[^\\$])\$(?!\$)([^$\n]+)\$(?!\$)$`), so `\$` escapes work the same.
 * Inside table cells and code blocks the rule is disabled — mirroring the
 * tiptap table guard and the PM schema's no-marks-in-code behavior.
 *
 * Pasting: `text/plain` payloads are split on the unanchored `$…$` regex
 * into alternating text / inline-math runs (tiptap `markPasteRule` parity,
 * which — like tiptap — has no table guard).
 */

const MATH_INLINE_INPUT_REGEX = /(^|[^\\$])\$(?!\$)([^$\n]+)\$(?!\$)$/
const MATH_INLINE_PASTE_REGEX = /(^|[^\\$])\$(?!\$)([^$\n]+)\$(?!\$)/g

function $insideTableOrCode(node: import('lexical').LexicalNode): boolean {
  let cursor: import('lexical').LexicalNode | null = node
  while (cursor !== null) {
    const type = cursor.getType()
    if (type === 'tablecell' || type === 'code') {
      return true
    }
    cursor = cursor.getParent()
  }
  return false
}

function $convertTrailingMath(node: TextNode): void {
  if ($isInlineMathNode(node)) {
    return
  }
  const text = node.getTextContent()
  const match = MATH_INLINE_INPUT_REGEX.exec(text)
  if (match === null) {
    return
  }
  // Caret must be collapsed right after the closing `$`.
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return
  }
  const anchor = selection.anchor
  if (anchor.type !== 'text' || anchor.getNode().getKey() !== node.getKey() || anchor.offset !== text.length) {
    return
  }
  if ($insideTableOrCode(node)) {
    return
  }
  const prefix = text.slice(0, match.index + (match[1]?.length ?? 0))
  const tex = match[2] ?? ''
  const parent = node.getParent()
  const indexInParent = node.getIndexWithinParent()
  const mathNode = $createInlineMathNode(tex, undefined, undefined, generateBlockKey())
  if (prefix === '' && text === match[0]) {
    // The whole node is the math run — swap it out entirely.
    node.replace(mathNode)
  } else {
    node.setTextContent(prefix)
    node.insertAfter(mathNode)
  }
  // Park the caret right after the math node.
  if (parent !== null) {
    parent.select(
      indexInParent + (prefix === '' && text === match[0] ? 1 : 2),
      indexInParent + (prefix === '' && text === match[0] ? 1 : 2),
    )
  }
}

/** Split a raw text run on the paste regex into detached text / math nodes. */
function $splitPastedText(text: string): LexicalNode[] {
  MATH_INLINE_PASTE_REGEX.lastIndex = 0
  const parts: LexicalNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = MATH_INLINE_PASTE_REGEX.exec(text)) !== null) {
    const fullStart = match.index
    if (fullStart > cursor) {
      parts.push($createTextNode(text.slice(cursor, fullStart)))
    }
    const tex = match[2] ?? ''
    if (tex !== '') {
      parts.push($createInlineMathNode(tex, undefined, undefined, generateBlockKey()))
    }
    cursor = fullStart + match[0].length
  }
  if (cursor < text.length) {
    parts.push($createTextNode(text.slice(cursor)))
  }
  return parts
}

/** Register the typing + paste math rules (idempotent per editor). */
export function registerMathInputRules(editor: LexicalEditor): () => void {
  const removeTransform = editor.registerNodeTransform(TextNode, (node) => {
    $convertTrailingMath(node)
  })
  const removePaste = editor.registerCommand(
    PASTE_COMMAND,
    (event) => {
      if (!(event instanceof ClipboardEvent) || event.clipboardData === null) {
        // InputEvent (mobile) / KeyboardEvent pastes keep the default path.
        return false
      }
      // Files (images) keep the default path.
      if (event.clipboardData.files.length > 0) {
        return false
      }
      const text = event.clipboardData.getData('text/plain')
      if (text === '') {
        return false
      }
      MATH_INLINE_PASTE_REGEX.lastIndex = 0
      if (!MATH_INLINE_PASTE_REGEX.test(text)) {
        return false
      }
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return false
      }
      event.preventDefault()
      const finalNodes: LexicalNode[] = []
      for (const node of $generateNodesFromRawText(text)) {
        if ($isTextNode(node)) {
          const parts = $splitPastedText(node.getTextContent())
          if (parts.length === 1 && parts[0]?.getType() === 'text') {
            finalNodes.push(node)
          } else {
            finalNodes.push(...parts)
          }
        } else {
          finalNodes.push(node)
        }
      }
      selection.insertNodes(finalNodes)
      return true
    },
    COMMAND_PRIORITY_HIGH,
  )
  return () => {
    removeTransform()
    removePaste()
  }
}
