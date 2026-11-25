import { isSlashTriggerPress } from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { CardMenuPopup, type CardMenuPopupHandle } from '@kobato/inkling-internal/plugins/CardMenuPopup'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type ReactElement, useEffect, useRef } from 'react'
export default function SlashCardMenuPlugin(): ReactElement | null {
  const [editor] = useLexicalComposerContext()
  const popupRef = useRef<CardMenuPopupHandle | null>(null)

  useEffect(() => {
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
