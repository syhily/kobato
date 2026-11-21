import { handlePlainTextPaste } from '@kobato/inkling-internal/plugins/behaviour/plain-text-paste'
import { registerParagraphRestriction } from '@kobato/inkling-internal/plugins/behaviour/restrict-content'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical'
import React from 'react'

export const RestrictContentPlugin = ({ paragraphs, allowBr }: { paragraphs: number; allowBr?: boolean }) => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    return mergeRegister(
      registerParagraphRestriction(editor, paragraphs),
      editor.registerCommand(
        PASTE_COMMAND,
        (clipboardEvent) => {
          if (!(clipboardEvent instanceof ClipboardEvent)) {
            return false
          }
          const clipboardData = clipboardEvent.clipboardData
          if (!clipboardData) {
            return false
          }

          return handlePlainTextPaste(editor, clipboardData, clipboardEvent, {
            allowBr: allowBr ?? false,
            skipCardShortcutGuard: true,
          })
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [allowBr, editor, paragraphs])
  return null
}

export default RestrictContentPlugin
