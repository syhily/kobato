// The paste dialect of Inkling's two markdown dialects — markdown-it →
// sanitize → Lexical HTML import. The markdown-it → sanitize chain is the
// headless `markdownToSanitizedHtml` (`@/plugins/behaviour/markdownPaste`);
// this plugin keeps only the DataTransfer glue and command handling.
import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import {
  getModifierState,
  MIME_TEXT_HTML,
  MIME_TEXT_PLAIN,
  PASTE_MARKDOWN_COMMAND,
} from '@/plugins/behaviour/clipboard-protocol'
import { markdownToSanitizedHtml } from '@/plugins/behaviour/markdownPaste'

export const MarkdownPastePlugin = () => {
  const [editor] = useLexicalComposerContext()
  // Reading the modifier state also attaches the protocol's own keydown/keyup
  // listeners (lazily, once per editor) — see clipboard-protocol.ts.
  const modifierState = getModifierState(editor)

  React.useEffect(() => {
    return editor.registerCommand(
      PASTE_MARKDOWN_COMMAND,
      ({ text, allowBr }) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return false
        }
        const dataTransfer = new DataTransfer()
        if (modifierState.current) {
          dataTransfer.setData(MIME_TEXT_PLAIN, text)
        } else {
          dataTransfer.setData(MIME_TEXT_HTML, markdownToSanitizedHtml(text, { allowBr }))
        }
        $insertDataTransferForRichText(dataTransfer, selection, editor)

        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, modifierState])

  return null
}

export default MarkdownPastePlugin
