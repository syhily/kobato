import {
  registerPlusCardMenuTrigger,
  resolvePlusHoverButtonVerdict,
} from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { CardMenuPopup, type CardMenuPopupHandle } from '@kobato/inkling-internal/plugins/CardMenuPopup'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type ReactElement, useEffect, useRef } from 'react'
export default function PlusCardMenuPlugin(): ReactElement | null {
  const [editor] = useLexicalComposerContext()
  const popupRef = useRef<CardMenuPopupHandle | null>(null)
  useEffect(() => {
    return registerPlusCardMenuTrigger(editor, {
      onVerdict: (verdict) => popupRef.current?.applyButtonVerdict(verdict),
    })
  }, [editor])

  useEffect(() => {
    const updateButtonOnMousemove = (event: MouseEvent) => {
      const verdict = resolvePlusHoverButtonVerdict(editor, event.pageX, event.pageY)
      if (verdict) {
        popupRef.current?.applyHoverButtonVerdict(verdict)
      }
    }

    window.addEventListener('mousemove', updateButtonOnMousemove)
    return () => {
      window.removeEventListener('mousemove', updateButtonOnMousemove)
    }
  }, [editor])

  useEffect(() => {
    const hideOnOutsideSelection = () => popupRef.current?.hideButtonOnOutsideSelection()
    document.addEventListener('selectionchange', hideOnOutsideSelection)
    return () => {
      document.removeEventListener('selectionchange', hideOnOutsideSelection)
    }
  }, [])

  return <CardMenuPopup ref={popupRef} anchor="button" editor={editor} trigger="button" />
}
