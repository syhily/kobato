import type { AnyLexicalCommand } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_EDITOR } from 'lexical'
import { useEffect } from 'react'

export const InklingEditorEventPlugin = ({
  command,
  onEvent,
}: {
  command: AnyLexicalCommand
  onEvent?: () => void
}) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    return editor.registerCommand(
      command,
      () => {
        onEvent?.()

        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor, command, onEvent])

  return null
}
