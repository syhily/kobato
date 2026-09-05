import type { LexicalCommand, LexicalEditor } from 'lexical'

import { createCommand } from 'lexical'

// The clipboard protocol — the paste pipeline's shared vocabulary, owned by
// this one headless module so the React-free behaviour layer never imports a
// React file to learn the protocol's nouns.
//
// The pipeline, leg by leg:
// - entry: `registerPasteHandler.ts` (`PASTE_COMMAND`) routes clipboard events
// - plain-text classifier: `plainTextPaste.ts` (plan 010's consolidation)
// - link leg: `PASTE_LINK_COMMAND` (already headless in `behaviour/commands.ts`)
//   → `registerLinkMatching.ts`
// - markdown leg: `PASTE_MARKDOWN_COMMAND` (below) → the headless
//   `markdownToSanitizedHtml` (`markdownPaste.ts`) → `MarkdownPastePlugin.tsx`
//   keeps only the DataTransfer glue and command handling
// - file leg: `INSERT_MEDIA_COMMAND` (below), dispatched by
//   `DragDropPastePlugin.tsx` → claimed per card by `CardInsertPlugin.tsx`
// - shared modifier state: one `ModifierState` per editor (below), written by
//   this module's own keydown/keyup listeners and read by the markdown and
//   link legs
// - input-side link acceptance: `isPasteableLinkUrl` (below) decides whether
//   pasted text becomes a link

export const MIME_TEXT_PLAIN = 'text/plain'
export const MIME_TEXT_HTML = 'text/html'

export const PASTE_MARKDOWN_COMMAND = createCommand<{ text: string; allowBr: boolean }>('PASTE_MARKDOWN_COMMAND')

export const INSERT_MEDIA_COMMAND: LexicalCommand<{ type: string | undefined; file: File }> = createCommand()

export interface ModifierState {
  current: boolean
}

const modifierStates = new WeakMap<LexicalEditor, ModifierState>()

// One modifier-state object per editor, created lazily. The
// `{ current: boolean }` shape matches `LinkMatchingDeps.isShiftPressed`
// (`registerLinkMatching.ts`), so the behaviour layer's deps interface is
// unchanged. The protocol owns the writes as well as the state: the first
// `getModifierState(editor)` call for an editor attaches one document
// keydown/keyup listener pair that writes the single `event.shiftKey`
// formulation. Reading the held-state off every key event (rather than
// toggling on `e.key === 'Shift'`) also covers the dual-shift corner —
// releasing one of two held Shift keys reports `shiftKey: true`, so the
// state stays pressed until the last Shift is released.
//
// Teardown: there is none, by convention. Lexical editors have no destroy
// hook, and the codebase's other per-editor WeakMap resource
// (`WordCountPlugin`'s word-count state) likewise relies on the key's GC
// rather than explicit teardown. The listeners close over the state object
// only — never the editor — so the editor itself stays collectible; a
// destroyed editor leaves an inert listener pair writing to an orphaned
// state object until page unload.
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

// Input-side link acceptance: decides "should this pasted text become a
// link" (`plainTextPaste.ts`). The export-side counterpart is `isSafeUrl`
// (`@/nodes/base/utils/is-safe-url`, behind the render context's `safeUrl`),
// which decides "is this href safe to emit" and keeps only
// http/https/relative. The two sets differ deliberately: a pasted
// ftp/mailto/tel link is live in the editor and blanked on export. The
// divergence is pinned in `test/unit/plugins/behaviour/clipboard-protocol.test.tsx`.
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
