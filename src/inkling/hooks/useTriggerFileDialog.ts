import { type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

import { $updateCardNode } from '@/inkling/nodes/base'

/** A card node carrying the transient `triggerFileDialog` flag (image, audio, video, file). */
export interface TriggerFileDialogCardNode extends LexicalNode {
  set triggerFileDialog(shouldTrigger: boolean)
}

export interface UseTriggerFileDialogOptions<TNode extends TriggerFileDialogCardNode> {
  editor: LexicalEditor
  nodeKey: NodeKey
  /** The card-node type guard the typed seam narrows with (e.g. `$isImageNode`). */
  guard: (node: unknown) => node is TNode
  fileInputRef: React.RefObject<HTMLInputElement | null>
  triggerFileDialog: boolean | undefined
}

/**
 * The one open-picker-on-insert effect: checks the prop on every render (the
 * audio/video semantics subsume image's deps-pinned and file's mount-only
 * variants for the insert flow), keeps the setTimeout + cleanup, and clears the
 * flag through the card write seam.
 */
export function useTriggerFileDialog<TNode extends TriggerFileDialogCardNode>({
  editor,
  nodeKey,
  guard,
  fileInputRef,
  triggerFileDialog,
}: UseTriggerFileDialogOptions<TNode>): void {
  // a card inserted from the card menu or slash command shows the file picker
  // immediately; the setTimeout avoids React's dev-mode double render
  React.useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      fileInputRef.current?.click()

      // Clear the flag on the node so a re-render cannot re-trigger the dialog.
      editor.update(() => {
        $updateCardNode(nodeKey, guard, (node) => {
          node.triggerFileDialog = false
        })
      })
    })

    return () => {
      clearTimeout(renderTimeout)
    }
  })
}
