import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { BLUR_COMMAND, COMMAND_PRIORITY_EDITOR } from 'lexical'
import { useEffect } from 'react'

export const InklingBlurPlugin = ({ onBlur }: { onBlur?: () => void }) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.registerCommand(
      BLUR_COMMAND,
      () => {
        onBlur?.()
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor, onBlur])

  return null
}
