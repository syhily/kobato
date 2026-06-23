import type { LexicalEditor } from 'lexical'

import { $getSelection } from 'lexical'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import { Portal } from '@/ui/inkling/components/ui/Portal'
import { getScrollParent } from '@/ui/inkling/utils/getScrollParent'
import { $getSelectionRangeRect } from '@/ui/inkling/utils/getSelectionRangeRect'
import { setFloatingElemPosition } from '@/ui/inkling/utils/setFloatingElemPosition'

/**
 * Floating toolbar portal shell — faithful port of Koenig's FloatingToolbar.jsx.
 *
 * Renders a toolbar into document.body via Portal, positions it above the
 * current text selection, and handles:
 *   - Repositioning on selection change / scroll / resize
 *   - Opacity transition (0 → 1 after positioned)
 *
 * Key difference from my previous rewrite: uses `editor.update()` (not
 * `editor.getEditorState().read()`) to read the selection rect, matching
 * Koenig exactly.
 */
export function FloatingToolbar({
  anchorElem,
  children,
  editor,
  isVisible,
  shouldReposition = true,
}: {
  anchorElem: HTMLElement
  children: ReactNode
  editor: LexicalEditor
  isVisible: boolean
  shouldReposition?: boolean
}) {
  const toolbarRef = useRef<HTMLDivElement>(null)

  const updateToolbarPosition = useCallback(
    (reposition = true) => {
      editor.update(() => {
        const toolbarElement = toolbarRef.current
        if (!toolbarElement) {
          return
        }

        // don't reposition toolbar if visible and reposition disabled
        if (toolbarElement.style.opacity === '1' && !reposition) {
          return
        }

        const selection = $getSelection()
        const rangeRect = $getSelectionRangeRect(editor, selection)

        if (!rangeRect) {
          return
        }

        setFloatingElemPosition(rangeRect, toolbarElement, anchorElem)
      })
    },
    [anchorElem, editor],
  )

  useEffect(() => {
    if (isVisible) {
      updateToolbarPosition(shouldReposition)
    }
  }, [isVisible, shouldReposition, updateToolbarPosition])

  useEffect(() => {
    const scrollElement = getScrollParent(anchorElem)

    const onEvent = () => updateToolbarPosition(true)
    window.addEventListener('resize', onEvent)
    if (scrollElement) {
      scrollElement.addEventListener('scroll', onEvent)
    }

    return () => {
      window.removeEventListener('resize', onEvent)
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', onEvent)
      }
    }
  }, [anchorElem, updateToolbarPosition])

  if (!isVisible) {
    return null
  }

  return (
    <Portal>
      <div
        ref={toolbarRef}
        className="not-kg-prose fixed z-[10000]"
        style={{ opacity: 0, transition: 'opacity 100ms ease' }}
        data-kg-floating-toolbar
      >
        {children}
      </div>
    </Portal>
  )
}
