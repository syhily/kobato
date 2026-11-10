import type { LexicalCommand, LexicalEditor } from 'lexical'

import { createCommand } from 'lexical'

// The clipboard protocol's shared vocabulary. Kept headless so the React-free
// behaviour layer never imports a React file to learn the protocol's nouns.

export const MIME_TEXT_PLAIN = 'text/plain'
export const MIME_TEXT_HTML = 'text/html'

export const PASTE_MARKDOWN_COMMAND = createCommand<{ text: string; allowBr: boolean }>('PASTE_MARKDOWN_COMMAND')

export const INSERT_MEDIA_COMMAND: LexicalCommand<{ type: string | undefined; file: File }> = createCommand()

export interface ModifierState {
  current: boolean
}

const modifierStates = new WeakMap<LexicalEditor, ModifierState>()

// One modifier-state object per editor, created lazily. The `{ current: boolean }`
// shape is shared with `LinkMatchingDeps.isShiftPressed`. The first call attaches
// one document keydown/keyup pair writing `event.shiftKey`: reading the held state
// off every key event (rather than toggling on `e.key === 'Shift'`) covers the
// dual-shift corner, where releasing one of two held Shift keys still reports
// `shiftKey: true`.
//
// There is no teardown by convention (Lexical editors have no destroy hook). The
// listeners close over the state object only, never the editor, so the editor
// stays collectible; a destroyed editor leaves an inert listener pair until page
// unload.
export function getModifierState(editor: LexicalEditor): ModifierState {
  const existing = modifierStates.get(editor)
  if (existing) {
    return existing
  }
  const state: ModifierState = { current: false }
  modifierStates.set(editor, state)
  // Guarded for SSR/headless environments: `getModifierState` runs during
  // plugin render, where `document` may not exist.
  if (typeof document !== 'undefined') {
    const writeShiftState = (event: KeyboardEvent) => {
      state.current = event.shiftKey
    }
    document.addEventListener('keydown', writeShiftState)
    document.addEventListener('keyup', writeShiftState)
  }
  return state
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'ftp:'])

// Input-side link acceptance: decides "should this pasted text become a link".
// The export-side counterpart `isSafeUrl` keeps only http/https/relative. The two
// sets differ deliberately: a pasted ftp/mailto/tel link is live in the editor and
// blanked on export (pinned in clipboard-protocol.test.tsx).
export function isPasteableLinkUrl(url: string): boolean {
  if (/\s/.test(url)) {
    return false
  }

  try {
    const parsed = new URL(url)
    return ALLOWED_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}
