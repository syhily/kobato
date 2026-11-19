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
          // PASTE_COMMAND's payload is ClipboardEvent | InputEvent |
          // KeyboardEvent (Lexical dispatches InputEvent from its beforeinput
          // paste path); only ClipboardEvent carries clipboardData
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
        // HIGH so the restriction preempts InklingBehaviourPlugin's general
        // LOW-priority paste handler regardless of mount order — same-priority
        // listeners run in registration order and the composable editor mounts
        // the behaviour plugin first, which would otherwise consume plain
        // text with allowBr: true and leak <br> into restricted editors. The
        // at-link paste guard (also HIGH) registers earlier still, so paste
        // inside at-link nodes keeps winning.
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [allowBr, editor, paragraphs])
  return null
}

export default RestrictContentPlugin
