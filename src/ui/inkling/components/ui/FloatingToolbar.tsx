import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { SELECTION_CHANGE_COMMAND } from 'lexical'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Portal } from '@/ui/inkling/components/ui/Portal'
import { $getSelectionRangeRect } from '@/ui/inkling/utils/getSelectionRangeRect'
import { getScrollParent } from '@/ui/inkling/utils/getScrollParent'
import { setFloatingElemPosition } from '@/ui/inkling/utils/setFloatingElemPosition'

/**
 * Floating toolbar portal shell — ported from Koenig's FloatingToolbar.jsx.
 *
 * Renders a toolbar into document.body via Portal, positions it above the
 * current text selection, and handles:
 *   - Repositioning on selection change / scroll / resize
 *   - Hiding when there's no valid selection (collapsed, composing, or
 *     inside a card)
 *   - The `shouldReposition` prop lets the parent freeze the toolbar
 *     position while a format is being applied (prevents toolbar jump)
 */
export function FloatingToolbar({
  isVisible,
  shouldReposition = true,
  children,
}: {
  isVisible: boolean
  shouldReposition?: boolean
  children: ReactNode
}) {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [opacity, setOpacity] = useState(0)

  // Reposition the toolbar on selection change
  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (!shouldReposition || !isVisible) {
          return false
        }
        positionToolbar()
        return false
      },
      1,
    )
  }, [editor, isVisible, shouldReposition])

  // Reposition on scroll + resize
  useEffect(() => {
    if (!isVisible) {
      return
    }
    const rootElement = editor.getRootElement()
    if (rootElement === null) {
      return
    }
    const scroller = getScrollParent(rootElement.parentElement)

    const handleScroll = () => positionToolbar()
    const handleResize = () => positionToolbar()

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    positionToolbar()

    return () => {
      scroller.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [editor, isVisible])

  function positionToolbar() {
    const toolbar = toolbarRef.current
    const rootElement = editor.getRootElement()
    if (toolbar === null || rootElement === null) {
      return
    }

    editor.getEditorState().read(() => {
      const targetRect = $getSelectionRangeRect(editor)
      if (targetRect === null) {
        setOpacity(0)
        return
      }

      const scroller = getScrollParent(rootElement.parentElement)
      setFloatingElemPosition(targetRect, toolbar, scroller, 10, false)
      setOpacity(1)
    })
  }

  if (!isVisible) {
    return null
  }

  return (
    <Portal>
      <div
        ref={toolbarRef}
        className="not-kg-prose fixed z-[10000]"
        style={{ opacity, transition: 'opacity 100ms ease' }}
        data-kg-floating-toolbar
        aria-hidden={opacity === 0}
      >
        {children}
      </div>
    </Portal>
  )
}
