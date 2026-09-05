import { $getSelection, type LexicalEditor } from 'lexical'
import React from 'react'

import Portal from '@/components/ui/Portal'
import { usePopupRepositionSubscriptions } from '@/hooks/useSelectionAnchoredPopup'
import { $getSelectionRangeRect } from '@/utils/$getSelectionRangeRect'
import { getScrollAncestor } from '@/utils/scroll-ancestor'
import { setFloatingElemPosition } from '@/utils/setFloatingElemPosition'

interface FloatingToolbarProps {
  anchorElem: HTMLElement
  children?: React.ReactNode
  editor: LexicalEditor
  isVisible?: boolean
  toolbarRef?: React.RefObject<HTMLDivElement | null>
  targetElem?: HTMLElement | null
  onReposition?: () => void
  shouldReposition?: boolean
  controlOpacity?: boolean
}

export default function FloatingToolbar({
  anchorElem,
  children,
  editor,
  isVisible,
  toolbarRef,
  targetElem,
  onReposition,
  shouldReposition = true,
  controlOpacity,
}: FloatingToolbarProps) {
  const updateToolbarPosition = React.useCallback(
    (reposition = true) => {
      editor.update(() => {
        const toolbarElement = toolbarRef?.current
        if (!toolbarElement) {
          return
        }

        // don't reposition toolbar if visible and reposition disabled
        if (toolbarElement.style.opacity === '1' && !reposition) {
          return
        }

        let rangeRect: DOMRect | null = null

        if (targetElem) {
          rangeRect = targetElem.getClientRects()[0]
        }

        if (!rangeRect) {
          const selection = $getSelection()
          rangeRect = $getSelectionRangeRect({ editor, selection })
        }

        if (!rangeRect) {
          return
        }

        setFloatingElemPosition(rangeRect, toolbarElement, anchorElem, { controlOpacity })
      })
    },
    [anchorElem, controlOpacity, editor, targetElem, toolbarRef],
  )

  React.useEffect(() => {
    if (isVisible) {
      updateToolbarPosition(shouldReposition)

      if (shouldReposition) {
        onReposition?.()
      }
    }
  }, [isVisible, onReposition, shouldReposition, updateToolbarPosition])

  const scrollElement = React.useMemo(() => getScrollAncestor(anchorElem), [anchorElem])
  usePopupRepositionSubscriptions(updateToolbarPosition, scrollElement)

  if (!isVisible) {
    return null
  }

  return (
    <Portal>
      <div
        ref={toolbarRef}
        className="not-inkling-prose fixed z-[10000]"
        style={{ opacity: 0, transition: 'opacity 100ms ease' }}
        data-inkling-floating-toolbar
      >
        {children}
      </div>
    </Portal>
  )
}
