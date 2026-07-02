import { $getSelection, type LexicalEditor } from 'lexical'
import React from 'react'

import Portal from '@/ui/inkling-editor/components/ui/Portal'
import { $getSelectionRangeRect } from '@/ui/inkling-editor/utils/$getSelectionRangeRect'
import { getScrollParent } from '@/ui/inkling-editor/utils/getScrollParent'
import { setFloatingElemPosition } from '@/ui/inkling-editor/utils/setFloatingElemPosition'

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

        let rangeRect

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

  React.useEffect(() => {
    const scrollElement = getScrollParent(anchorElem)

    const onResize = () => updateToolbarPosition()
    const onScroll = () => updateToolbarPosition()
    window.addEventListener('resize', onResize)
    if (scrollElement) {
      scrollElement.addEventListener('scroll', onScroll)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', onScroll)
      }
    }
  }, [anchorElem, updateToolbarPosition])

  if (!isVisible) {
    return null
  }

  return (
    <Portal>
      <div
        ref={toolbarRef as React.RefObject<HTMLDivElement>}
        className="not-inkling-prose fixed z-[10000]"
        style={{ opacity: 0, transition: 'opacity 100ms ease' }}
        data-inkling-floating-toolbar
      >
        {children}
      </div>
    </Portal>
  )
}
