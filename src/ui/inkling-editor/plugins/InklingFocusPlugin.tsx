import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_EDITOR, FOCUS_COMMAND } from 'lexical'
import { useEffect } from 'react'

export const InklingFocusPlugin = ({ onFocus }: { onFocus?: () => void }) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        onFocus?.()
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor, onFocus])

  return null
}
