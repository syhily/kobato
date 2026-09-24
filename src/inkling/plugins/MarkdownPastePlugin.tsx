// The paste dialect of Inkling's two markdown dialects — markdown-it →
// sanitize → Lexical HTML import. The markdown-it → sanitize chain is the
// headless `markdownToSanitizedHtml` (`@/inkling/plugins/behaviour/markdownPaste`);
// this plugin keeps only the DataTransfer glue and command handling.
import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'
import React from 'react'

import { loadPasteDialect } from '@/inkling/markdown/lazy-paste-dialect'
import {
  getModifierState,
  MIME_TEXT_HTML,
  MIME_TEXT_PLAIN,
  PASTE_MARKDOWN_COMMAND,
} from '@/inkling/plugins/behaviour/clipboard-protocol'
import { markdownToSanitizedHtml } from '@/inkling/plugins/behaviour/markdownPaste'

export const MarkdownPastePlugin = () => {
  const [editor] = useLexicalComposerContext()
  // Reading the modifier state also attaches the protocol's own keydown/keyup
  // listeners (lazily, once per editor) — see clipboard-protocol.ts.
  const modifierState = getModifierState(editor)

  // Pre-warm the paste dialect chunk: the command handler below and the
  // markdown card's exportDOM (browser copy) consume the engine
  // synchronously, so it must be loaded before either runs. Idle-scheduled so
  // the fetch never contends with editor mount; the cold-paste path still
  // awaits the load before dispatching, so correctness never depends on this.
  React.useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(() => void loadPasteDialect())
      return () => cancelIdleCallback(handle)
    }
    const timeout = setTimeout(() => void loadPasteDialect(), 0)
    return () => clearTimeout(timeout)
  }, [])

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
