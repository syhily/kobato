import { $updateCardNode } from '@kobato/inkling-internal/nodes/base'
import { type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'
import { type RefObject, useEffect } from 'react'
export interface TriggerFileDialogCardNode extends LexicalNode {
  set triggerFileDialog(shouldTrigger: boolean)
}

export interface UseTriggerFileDialogOptions<TNode extends TriggerFileDialogCardNode> {
  editor: LexicalEditor
  nodeKey: NodeKey
  guard: (node: unknown) => node is TNode
  fileInputRef: RefObject<HTMLInputElement | null>
  triggerFileDialog: boolean | undefined
}

export function useTriggerFileDialog<TNode extends TriggerFileDialogCardNode>({
  editor,
  nodeKey,
  guard,
  fileInputRef,
  triggerFileDialog,
}: UseTriggerFileDialogOptions<TNode>): void {
  useEffect(() => {
    if (!triggerFileDialog) {
      return
    }

    const renderTimeout = setTimeout(() => {
      fileInputRef.current?.click()

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
