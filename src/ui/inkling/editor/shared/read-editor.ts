import type { LexicalEditor } from 'lexical'

/**
 * Run a synchronous read callback inside the editor's current state and
 * return its result. This is the canonical wrapper for the recurring
 * `let x; editor.read(() => { x = ... }); return x` pattern that appeared
 * 5+ times across the editor.
 *
 * Lexical 0.13 has no `editor.read()` (added in later versions), so this
 * wraps `editor.getEditorState().read()`. DOM-node lookup helpers that need
 * an active editor binding must run inside `editor.update()` instead.
 */
export function readEditor<T>(editor: LexicalEditor, fn: () => T): T {
  let result: T
  editor.getEditorState().read(() => {
    result = fn()
  })
  // The read callback runs synchronously, so `result` is always assigned
  // by the time we reach this line.
  return result!
}
