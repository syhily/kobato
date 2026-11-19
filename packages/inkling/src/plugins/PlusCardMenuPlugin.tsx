import {
  registerPlusCardMenuTrigger,
  resolvePlusHoverButtonVerdict,
} from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { CardMenuPopup, type CardMenuPopupHandle } from '@kobato/inkling-internal/plugins/CardMenuPopup'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export default function PlusCardMenuPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext()
  const popupRef = React.useRef<CardMenuPopupHandle | null>(null)
  React.useEffect(() => {
    return registerPlusCardMenuTrigger(editor, {
      onVerdict: (verdict) => popupRef.current?.applyButtonVerdict(verdict),
    })
  }, [editor])

  React.useEffect(() => {
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

  React.useEffect(() => {
    const hideOnOutsideSelection = () => popupRef.current?.hideButtonOnOutsideSelection()
    document.addEventListener('selectionchange', hideOnOutsideSelection)
    return () => {
      document.removeEventListener('selectionchange', hideOnOutsideSelection)
    }
  }, [])

  return <CardMenuPopup ref={popupRef} anchor="button" editor={editor} trigger="button" />
}
