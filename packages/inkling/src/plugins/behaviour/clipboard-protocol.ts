import type { LexicalCommand, LexicalEditor } from 'lexical'

import { createCommand } from 'lexical'

export const MIME_TEXT_PLAIN = 'text/plain'
export const MIME_TEXT_HTML = 'text/html'

export const PASTE_MARKDOWN_COMMAND = createCommand<{ text: string; allowBr: boolean }>('PASTE_MARKDOWN_COMMAND')

export const INSERT_MEDIA_COMMAND: LexicalCommand<{ type: string | undefined; file: File }> = createCommand()

export interface ModifierState {
  current: boolean
}

const modifierStates = new WeakMap<LexicalEditor, ModifierState>()

export function getModifierState(editor: LexicalEditor): ModifierState {
  const existing = modifierStates.get(editor)
  if (existing) {
    return existing
  }
  const state: ModifierState = { current: false }
  modifierStates.set(editor, state)
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
