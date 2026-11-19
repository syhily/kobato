import type { LexicalEditor, ParagraphNode } from 'lexical'

import {
  $insertHorizontalRuleForUpdateScanTrigger,
  DIVIDER_REGEXP,
} from '@kobato/inkling-internal/markdown/card-shortcuts'
import {
  $createHorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@kobato/inkling-internal/nodes/HorizontalRuleNode'
import { registerUpdateScan } from '@kobato/inkling-internal/plugins/behaviour/update-scan'
import { getSelectedNode } from '@kobato/inkling-internal/utils/get-selected-node'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import { $getSelection, $isParagraphNode, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical'

export function $insertHorizontalRule(): boolean {
  const selection = $getSelection()

  if (!$isRangeSelection(selection)) {
    return false
  }
  const horizontalRuleNode = $createHorizontalRuleNode()
  const selectedNode = selection.focus.getNode()
  if ($isParagraphNode(selectedNode) && selectedNode.getTextContent() !== '') {
    selection.insertParagraph()
  }

  selection.focus.getNode().getTopLevelElementOrThrow().insertBefore(horizontalRuleNode)

  return true
}

export function resolveDividerScanTarget(editor: LexicalEditor): ParagraphNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null
  }

  const node = getSelectedNode(selection).getTopLevelElement()
  if (!node || !$isParagraphNode(node) || !DIVIDER_REGEXP.test(node.getTextContent())) {
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

export function registerHorizontalRuleInsert(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('horizontalrule')) {
    return () => {
      /* noop */
    }
  }
  return editor.registerCommand(INSERT_HORIZONTAL_RULE_COMMAND, () => $insertHorizontalRule(), COMMAND_PRIORITY_EDITOR)
}

export function registerHorizontalRuleScan(editor: LexicalEditor): () => void {
  if (!getRegisteredNodeMap(editor).has('horizontalrule')) {
    return () => {
      /* noop */
    }
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
