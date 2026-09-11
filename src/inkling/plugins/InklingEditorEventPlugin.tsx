import type { LexicalCommand } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_EDITOR } from 'lexical'
import { useEffect } from 'react'

/**
 * The shared scaffold behind InklingBlurPlugin / InklingFocusPlugin — the
 * two only ever differed by command and callback name.
 */
export const InklingEditorEventPlugin = ({
  command,
  onEvent,
}: {
  command: LexicalCommand<unknown>
  onEvent?: () => void
}) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    // return the unregister handle so the listener is removed on unmount
    return editor.registerCommand(
      command,
      () => {
        onEvent?.()
        // mark handled at editor priority so propagation stops here
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor, command, onEvent])

  return null
}
