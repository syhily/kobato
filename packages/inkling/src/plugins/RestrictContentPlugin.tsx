import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical'
import React from 'react'

import { handlePlainTextPaste } from '@/plugins/behaviour/plainTextPaste'
import { registerParagraphRestriction } from '@/plugins/behaviour/restrict-content'

/**
 * Paragraphs-only enforcement: any update strips decorator nodes (below) and
 * truncates the document to `paragraphs` paragraphs. That behaviour *is* the
 * contract — this plugin cannot express "render but don't insert": pointing
 * it at a surface that renders existing rich content deletes the existing
 * cards on the first edit. A render-but-don't-insert surface is pure
 * composition instead — compose only the whitelisted node classes into
 * `<InklingComposer nodes>` and omit the feature plugins that carry the
 * menus/insert registrations.
 */
export const RestrictContentPlugin = ({ paragraphs, allowBr }: { paragraphs: number; allowBr?: boolean }) => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    return mergeRegister(
      // the transform registration and its per-editor update guard live in
      // the behaviour layer, mirroring registerTableCellGuard
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
