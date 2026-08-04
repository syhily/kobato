import type { LexicalEditor } from 'lexical'

import { TOGGLE_LINK_COMMAND, type ToggleLinkPayload } from '@kobato/editor/engine/lexical/commands'
import { $createLinkNode, $isLinkNode, $toggleLink } from '@lexical/link'
import { COMMAND_PRIORITY_EDITOR, $createTextNode, $getSelection, $isRangeSelection } from 'lexical'

// Link apply surface for the Lexical engine — the counterpart of the
// tiptap LinkPopover's `setLink` / `insertContent` paths. The toolbar
// variant (`payload.text`) inserts a NEW linked text run at the caret
// (replacing the selection like tiptap's `insertContent`); the selection
// variant applies the URL to the current range, or unlinks when the URL
// is empty. New-tab links carry `target="_blank" rel="noreferrer noopener"`,
// same-tab links clear both attributes — mirroring `linkMarkAttributes`.

function $applyToggleLink(payload: ToggleLinkPayload): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  const attrs = payload.openInNewTab ? { rel: 'noreferrer noopener', target: '_blank' } : { rel: null, target: null }

  if (payload.text !== undefined) {
    // Toolbar variant — insert linked text at the caret.
    const url = payload.url
    if (url === '') {
      return false
    }
    const link = $createLinkNode(url, attrs)
    link.append($createTextNode(payload.text))
    selection.insertNodes([link])
    return true
  }

  // Selection variant — set / unset the link on the range.
  if (payload.url === '') {
    $toggleLink(null)
  } else {
    $toggleLink(payload.url, { target: attrs.target, rel: attrs.rel })
  }
  return true
}

/** Register the `TOGGLE_LINK_COMMAND` handler (idempotent per editor). */
export function registerLinkCommands(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    TOGGLE_LINK_COMMAND,
    (payload) => {
      editor.update(() => $applyToggleLink(payload))
      return true
    },
    COMMAND_PRIORITY_EDITOR,
  )
}

/** True when the collapsed caret sits inside a link (used by the bubble menu's link toggle). */
export function $isCaretInLink(): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  return $isLinkNode(selection.anchor.getNode())
}
