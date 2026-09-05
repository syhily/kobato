import type { LexicalEditor, NodeKey } from 'lexical'

import { $getNodeByKey, $getSelection, $isDecoratorNode, $isRangeSelection, $isTextNode } from 'lexical'

import type { TKHandle } from '@/plugins/behaviour/tkHandle'

import { $isTKNode, TKNode } from '@/nodes/base'
import { SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { nextTkNodeKey } from '@/plugins/behaviour/tk-indicator'

// TK tracking — the headless half of TKPlugin: the mutation-listener →
// handle bookkeeping (which TK node lives under which top-level node, per
// editor), the hover-highlight feed (the class swap across a top-level
// node's TK elements), and the indicator click's selection surgery. The
// plugin keeps the indicator component, the positioning (tk-indicator),
// and the portal. Mirrors the footnotes.ts/FootnotePlugin split: the
// behaviour registers against the editor and the handle; React renders.

/**
 * Feeds the tk handle from the editor's TKNode mutations: a created/updated
 * TK node is filed under its top-level element (or the card's own key when
 * the listener runs on a nested card editor — its TK nodes belong to the
 * card's indicator), a destroyed one is removed. The handle's throttled
 * derivation publishes the render-time tkNodeMap. Returns the unregister
 * callback.
 */
export function registerTkNodeTracking(
  editor: LexicalEditor,
  tkHandle: TKHandle,
  parentEditorNodeKey: string | null | undefined,
): () => void {
  return editor.registerMutationListener(TKNode, (mutatedNodes) => {
    editor.getEditorState().read(() => {
      // mutatedNodes is a Map where each key is the NodeKey, and the value is the state of mutation.
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
  /** The resting TK classes (removed while highlighted). */
  tkClasses: string[]
  /** The highlighted TK classes (added while highlighted). */
  tkHighlightClasses: string[]
}

/**
 * The hover-highlight feed: swaps the TK class set on every TK element
 * under a top-level node. No-op when the top-level node is a card — the
 * indicator belongs to the card's own chrome, and the card's TK nodes live
 * in nested editors whose elements the highlight must not touch.
 */
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

/**
 * The indicator click's selection surgery (the component keeps only the DOM
 * event): a decorator parent selects the whole card; otherwise the
 * selection cycles to the TK node after the currently selected one
 * (nextTkNodeKey — first when none is selected). Runs inside editor.update.
 */
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
