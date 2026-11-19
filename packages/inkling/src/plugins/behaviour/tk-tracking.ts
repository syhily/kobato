import type { TKHandle } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'
import type { LexicalEditor, NodeKey } from 'lexical'

import { $isTKNode, TKNode } from '@kobato/inkling-internal/nodes/base'
import { SELECT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { nextTkNodeKey } from '@kobato/inkling-internal/plugins/behaviour/tk-indicator'
import { $getNodeByKey, $getSelection, $isDecoratorNode, $isRangeSelection, $isTextNode } from 'lexical'

export function registerTkNodeTracking(
  editor: LexicalEditor,
  tkHandle: TKHandle,
  parentEditorNodeKey: string | null | undefined,
): () => void {
  return editor.registerMutationListener(TKNode, (mutatedNodes) => {
    editor.getEditorState().read(() => {
      for (const [tkNodeKey, mutation] of mutatedNodes) {
        if (mutation === 'destroyed') {
          tkHandle.removeEditorTkNode(editor.getKey(), tkNodeKey)
        } else {
          const parentNodeKey = $getNodeByKey(tkNodeKey)?.getTopLevelElement()?.getKey()
          const topLevelNodeKey = parentEditorNodeKey || parentNodeKey
          if (topLevelNodeKey) {
            tkHandle.addEditorTkNode(editor.getKey(), topLevelNodeKey, tkNodeKey)
          }
        }
      }
    })
  })
}

export interface TkHighlightClasses {
  tkClasses: string[]

  tkHighlightClasses: string[]
}

export function applyTkHoverHighlight(
  editor: LexicalEditor,
  parentKey: string,
  nodeKeys: string[],
  { tkClasses, tkHighlightClasses }: TkHighlightClasses,
  isHighlighted: boolean,
): void {
  let isCard = false
  editor.getEditorState().read(() => {
    if ($isDecoratorNode($getNodeByKey(parentKey))) {
      isCard = true
    }
  })

  if (isCard) {
    return
  }

  nodeKeys.forEach((key: string) => {
    const element = editor.getElementByKey(key)
    if (!element) {
      return
    }
    if (isHighlighted) {
      element.classList.remove(...tkClasses)
      element.classList.add(...tkHighlightClasses)
    } else {
      element.classList.add(...tkClasses)
      element.classList.remove(...tkHighlightClasses)
    }
  })
}

export function $selectTkFromIndicator(editor: LexicalEditor, parentKey: NodeKey, nodeKeys: NodeKey[]): void {
  if ($isDecoratorNode($getNodeByKey(parentKey))) {
    editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: parentKey })
    return
  }

  const selection = $getSelection()
  const selectedNode = $isRangeSelection(selection) ? selection.getNodes()[0] : null
  const currentKey = $isTKNode(selectedNode) ? selectedNode.getKey() : null

  const nodeKeyToSelect = nextTkNodeKey(nodeKeys, currentKey)
  const node = nodeKeyToSelect ? $getNodeByKey(nodeKeyToSelect) : null
  if ($isTextNode(node)) {
    node.select(0, node.getTextContentSize())
  }
}
