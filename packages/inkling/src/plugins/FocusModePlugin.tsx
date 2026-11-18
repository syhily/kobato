import { registerFocusMode } from '@kobato/inkling-internal/plugins/behaviour/focus-mode'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

// Writing-focus mode. Mounted by the 'focus-mode' core entry when the
// surface sets `focusMode`; the DOM bookkeeping lives headless in
// @kobato/inkling-internal/plugins/behaviour/focus-mode and the visual rules are host CSS.
export const FocusModePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerFocusMode(editor), [editor])

  return null
}

export default FocusModePlugin
