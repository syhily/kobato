import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { registerPlusCardMenuTrigger, resolvePlusHoverButtonVerdict } from '@/plugins/behaviour/card-menu-trigger'
import { CardMenuPopup, type CardMenuPopupHandle } from '@/plugins/CardMenuPopup'

// Plus card menu — trigger wiring only. The trigger policy (caret/hover
// verdicts, the selectionchange hide rule) lives in
// @/plugins/behaviour/card-menu-trigger; everything downstream — the session,
// the button's anchor chrome (including its Range, handed to the session on
// open), the menu itself — is CardMenuPopup's 'button' anchor policy, driven
// through the popup handle.
export default function PlusCardMenuPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext()
  const popupRef = React.useRef<CardMenuPopupHandle | null>(null)

  // the caret-based button verdicts arrive through the trigger registration
  React.useEffect(() => {
    return registerPlusCardMenuTrigger(editor, {
      onVerdict: (verdict) => popupRef.current?.applyButtonVerdict(verdict),
    })
  }, [editor])

  // the hover policy (elementFromPoint hit-testing, the left-gutter fudge)
  // lives in the trigger module; this is only the mousemove wiring
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

  // a native selection landing outside the editor hides the button — the rule
  // itself (including the open-menu exception) is the popup's
  React.useEffect(() => {
    const hideOnOutsideSelection = () => popupRef.current?.hideButtonOnOutsideSelection()
    document.addEventListener('selectionchange', hideOnOutsideSelection)
    return () => {
      document.removeEventListener('selectionchange', hideOnOutsideSelection)
    }
  }, [])

  return <CardMenuPopup ref={popupRef} anchor="button" editor={editor} trigger="button" />
}
