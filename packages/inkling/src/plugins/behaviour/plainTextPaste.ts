import type { LexicalEditor } from 'lexical'

import { $getSelection, $isRangeSelection } from 'lexical'

import { isPasteableLinkUrl, MIME_TEXT_HTML, MIME_TEXT_PLAIN, PASTE_MARKDOWN_COMMAND } from './clipboard-protocol'
import { PASTE_LINK_COMMAND } from './commands'

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

  // Use shared URL validator so mailto:, ftp:, tel: etc. are handled consistently.
  const linkMatch: readonly [string, string] | null = text && isPasteableLinkUrl(text) ? [text, text] : null
  if (linkMatch) {
    if (!skipCardShortcutGuard) {
      // avoid any conversion if we're pasting onto a card shortcut
      const selection = $getSelection()
      const node = $isRangeSelection(selection) ? selection.anchor.getNode() : null
      if (node && node.getTextContent().startsWith('/')) {
        return false
      }
    }

    // we're pasting a URL, convert it to an embed/bookmark/link
    event.preventDefault()
    editor.dispatchCommand(PASTE_LINK_COMMAND, { linkMatch })

    return true
  }

  const html = clipboardData.getData(MIME_TEXT_HTML)
  if (text && !html) {
    event.preventDefault()
    editor.dispatchCommand(PASTE_MARKDOWN_COMMAND, { text, allowBr })

    return true
  }

  return false
}
