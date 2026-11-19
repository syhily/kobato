import type { LexicalEditor } from 'lexical'

import { getLoadedPasteDialect, loadPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import {
  isPasteableLinkUrl,
  MIME_TEXT_HTML,
  MIME_TEXT_PLAIN,
  PASTE_MARKDOWN_COMMAND,
} from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import { PASTE_LINK_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { $getSelection, $isRangeSelection } from 'lexical'

interface PlainTextPasteOptions {
  allowBr: boolean
  skipCardShortcutGuard?: boolean
}

export function handlePlainTextPaste(
  editor: LexicalEditor,
  clipboardData: DataTransfer,
  event: ClipboardEvent,
  { allowBr, skipCardShortcutGuard = false }: PlainTextPasteOptions,
): boolean {
  const text = clipboardData.getData(MIME_TEXT_PLAIN)

  const linkMatch: readonly [string, string] | null = text && isPasteableLinkUrl(text) ? [text, text] : null
  if (linkMatch) {
    if (!skipCardShortcutGuard) {
      const selection = $getSelection()
      const node = $isRangeSelection(selection) ? selection.anchor.getNode() : null
      if (node?.getTextContent().startsWith('/')) {
        return false
      }
    }

    event.preventDefault()
    editor.dispatchCommand(PASTE_LINK_COMMAND, { linkMatch })

    return true
  }

  const html = clipboardData.getData(MIME_TEXT_HTML)
  if (text && !html) {
    event.preventDefault()
    if (getLoadedPasteDialect()) {
      editor.dispatchCommand(PASTE_MARKDOWN_COMMAND, { text, allowBr })
    } else {
      // cold first paste (the mount pre-warm hasn't landed): await the engine
      // chunk, then run the same dispatch — the command handler's conversion
      // stays synchronous
      void loadPasteDialect().then(() => {
        editor.dispatchCommand(PASTE_MARKDOWN_COMMAND, { text, allowBr })
      })
    }

    return true
  }

  return false
}
