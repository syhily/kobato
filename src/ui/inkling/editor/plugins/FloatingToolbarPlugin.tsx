import { $getSelection, $isRangeSelection, $isRootNode, SELECTION_CHANGE_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical'
import { $isLinkNode } from '@lexical/link'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect, useState } from 'react'

import { FormatToolbar } from '@/ui/inkling/components/ui/FormatToolbar'
import { getSelectedNode } from '@/ui/inkling/utils/getSelectedNode'

/**
 * Floating toolbar plugin — ported from Koenig's FloatingToolbarPlugin.jsx.
 *
 * Decides when to show the floating text toolbar based on selection state.
 * Shows when:
 *   - There is a non-collapsed range selection
 *   - The selection contains text
 *   - The selection is not inside a card (decorator node)
 *   - The selection is not inside a link-only context (handled by LinkToolbar)
 *
 * Removed from Koenig: snippet toolbar, link-search toolbar, link toolbar
 * (handled separately).
 */
export function FloatingToolbarPlugin({ mode }: { mode: 'article' | 'comment' }) {
  const [editor] = useLexicalComposerContext()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            setIsVisible(false)
            return
          }

          // Don't show if selection is empty text
          if (selection.getTextContent().trim() === '') {
            setIsVisible(false)
            return
          }

          // Don't show if the anchor is inside a link (link toolbar handles it)
          const selectedNode = getSelectedNode(selection)
          const parent = selectedNode.getParent()
          if (parent !== null && $isLinkNode(parent)) {
            setIsVisible(false)
            return
          }

          // Don't show if the selection is inside a decorator/card
          const anchorNode = selectedNode.getKey() === 'root' ? selectedNode : selectedNode.getTopLevelElementOrThrow()
          if (anchorNode.getType() === 'root' && $isRootNode(anchorNode)) {
            // Root-level — fine to show
          }

          setIsVisible(true)
        })
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return <FormatToolbar mode={mode} isVisible={isVisible} />
}
