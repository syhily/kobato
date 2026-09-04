import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { registerFocusMode } from '@/plugins/behaviour/focus-mode'

// Writing-focus mode (tiptap extension-focus parity as a real UX — the
// tiptap class had no CSS consumer). Mounted by the 'focus-mode' core entry
// when the surface sets `focusMode`; the DOM bookkeeping lives headless in
// @/plugins/behaviour/focus-mode and the visual rules are host CSS.
export const FocusModePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerFocusMode(editor), [editor])

  return null
}

export default FocusModePlugin
