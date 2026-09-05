import type { LexicalEditor, ParagraphNode } from 'lexical'

import { $getSelection, $isParagraphNode, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical'

import { $insertHorizontalRuleForUpdateScanTrigger, DIVIDER_REGEXP } from '@/markdown/card-shortcuts'
import { $createHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@/nodes/HorizontalRuleNode'
import { registerUpdateScan } from '@/plugins/behaviour/update-scan'
import { getSelectedNode } from '@/utils/getSelectedNode'
import { getRegisteredNodeMap } from '@/utils/lexical-internals'

// Horizontal rule behaviour — the insert surgery and the divider scan's
// guard half, headless so both are synchronous test tables (the
// HorizontalRulePlugin keeps only registration). The divider's declaration
// declares no insert (the code-block precedent for menu-less shortcuts), so
// the command registers here beside the policy rather than through
// CardInsertPlugin's derived view.

/**
 * The HR insert surgery: insert the rule before the current paragraph's
 * top-level element, splitting off a fresh blank paragraph first when the
 * current one has content — the caret stays on a blank paragraph either
 * way. Returns false when there is no range selection to insert at. Must
 * run inside editor.update() (the command dispatch already provides it).
 */
export function $insertHorizontalRule(): boolean {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return false
  }

  const horizontalRuleNode = $createHorizontalRuleNode()

  // insert a paragraph unless we're already on a blank paragraph
  const selectedNode = selection.focus.getNode()
  if ($isParagraphNode(selectedNode) && selectedNode.getTextContent() !== '') {
    selection.insertParagraph()
  }

  // insert the horizontal rule before the current/inserted paragraph
  // so the cursor stays on the blank paragraph
  selection.focus.getNode().getTopLevelElementOrThrow().insertBefore(horizontalRuleNode)

  return true
}

/**
 * The divider scan's guard half: the paragraph node to transform, or null
 * when the scan must not fire — a non-collapsed selection, a non-'---'
 * paragraph, or a native caret that isn't a text node inside the editor
 * (compare the footnote caret trigger's guards in behaviour/footnotes.ts).
 */
export function resolveDividerScanTarget(editor: LexicalEditor): ParagraphNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null
  }

  const node = getSelectedNode(selection).getTopLevelElement()
  if (!node || !$isParagraphNode(node) || !node.getTextContent().match(DIVIDER_REGEXP)) {
    return null
  }

  const nativeSelection = window.getSelection()
  if (!nativeSelection) {
    return null
  }
  const anchorNode = nativeSelection.anchorNode
  const rootElement = editor.getRootElement()

  if (anchorNode?.nodeType !== Node.TEXT_NODE || !rootElement?.contains(anchorNode)) {
    return null
  }

  return node
}

/** Registers INSERT_HORIZONTAL_RULE_COMMAND. No-ops when the card is not registered. */
export function registerHorizontalRuleInsert(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('horizontalrule')) {
    return () => {}
  }
  return editor.registerCommand(INSERT_HORIZONTAL_RULE_COMMAND, () => $insertHorizontalRule(), COMMAND_PRIORITY_EDITOR)
}

/**
 * Registers the divider per-update scan: the registration policy
 * (history-tag / composing / empty-dirty skips, nested scan commit) lives
 * in the update-scan seam, the trigger regex and replace-and-select in the
 * card-shortcut seam; this module owns the guard half between them. No-ops
 * when the card is not registered.
 */
export function registerHorizontalRuleScan(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('horizontalrule')) {
    return () => {}
  }
  return registerUpdateScan(editor, {
    dirty: 'leaves-or-elements',
    scan: () => {
      const node = resolveDividerScanTarget(editor)
      if (node) {
        $insertHorizontalRuleForUpdateScanTrigger(node)
      }
    },
  })
}
