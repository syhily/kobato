import { type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

import { $updateCardNode } from '@/nodes/base'

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
 * The one open-picker-on-insert effect (plan 045), replacing four
 * near-verbatim copies with three dependency-array idioms. The hook checks
 * the prop on every render — the audio/video semantics, which subsume
 * image's deps-pinned and file's mount-only variants for the insert flow —
 * keeps the setTimeout + cleanup, and clears the flag through plan 044's
 * write seam.
 */
export function useTriggerFileDialog<TNode extends TriggerFileDialogCardNode>({
  editor,
  nodeKey,
  guard,
  fileInputRef,
  triggerFileDialog,
}: UseTriggerFileDialogOptions<TNode>): void {
  // when card is inserted from the card menu or slash command we want to show the file picker immediately
  // uses a setTimeout to avoid issues with React rendering the component twice in dev mode 🙈
  React.useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      // trigger dialog
      fileInputRef.current?.click()

      // clear the property on the node so we don't accidentally trigger anything with a re-render
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
