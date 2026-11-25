import { loadPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import {
  getModifierState,
  MIME_TEXT_HTML,
  MIME_TEXT_PLAIN,
  PASTE_MARKDOWN_COMMAND,
} from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import { markdownToSanitizedHtml } from '@kobato/inkling-internal/plugins/behaviour/markdown-paste'
import { $insertDataTransferForRichText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'
import { useEffect } from 'react'
export const MarkdownPastePlugin = () => {
  const [editor] = useLexicalComposerContext()
  const modifierState = getModifierState(editor)

  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(() => void loadPasteDialect())
      return () => cancelIdleCallback(handle)
    }
    const timeout = setTimeout(() => void loadPasteDialect(), 0)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
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
