import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

import { isSlashTriggerPress } from '@/plugins/behaviour/card-menu-trigger'
import { CardMenuPopup, type CardMenuPopupHandle } from '@/plugins/CardMenuPopup'

// Slash card menu — trigger wiring only. The valid-press grammar lives in the
// trigger module (@/plugins/behaviour/card-menu-trigger); everything
// downstream — the session, the slash trigger binding, the keyboard
// navigator, the menu itself — is CardMenuPopup's 'slash' trigger syntax over
// the 'selection' anchor policy, driven through the popup handle.
export default function SlashCardMenuPlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext()
  const popupRef = React.useRef<CardMenuPopupHandle | null>(null)

  // open the menu when / is pressed on a blank paragraph — this is only the
  // keypress wiring; openMenu is idempotent, so a second slash press while
  // the menu is open is a no-op (the session keeps the isOpen gate)
  React.useEffect(() => {
    const triggerMenu = (event: KeyboardEvent) => {
      if (isSlashTriggerPress(editor, event)) {
        popupRef.current?.openMenu()
      }
    }

    window.addEventListener('keypress', triggerMenu)
    return () => {
      window.removeEventListener('keypress', triggerMenu)
    }
  }, [editor])

  return <CardMenuPopup ref={popupRef} anchor="selection" editor={editor} replaceTriggerParagraph trigger="slash" />
}
