import { registerFocusMode } from '@kobato/inkling-internal/plugins/behaviour/focus-mode'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

export const FocusModePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => registerFocusMode(editor), [editor])

  return null
}

export default FocusModePlugin
