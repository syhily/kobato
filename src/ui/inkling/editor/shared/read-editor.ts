import type { LexicalEditor } from 'lexical'

/**
 * Run a synchronous read callback inside the editor's current state and
 * return its result. This is the canonical wrapper for the recurring
 * `let x; editor.read(() => { x = ... }); return x` pattern that appeared
 * 5+ times across the editor.
 *
 * Uses `editor.read()` (not `editor.getEditorState().read()`) so that:
 *   1. Pending updates are flushed before reading (latest state).
 *   2. The active editor is bound inside the callback via
 *      `{ editor: this }`, which node-lookup helpers like
 *      `$getNodeFromDOMNode` and `$getNearestNodeFromDOMNode` rely on.
 *      Without this binding, those helpers throw "Unable to find an active
 *      editor" when called from DOM event handlers (mousedown, etc).
 */
export function readEditor<T>(editor: LexicalEditor, fn: () => T): T {
  let result: T
  editor.read(() => {
    result = fn()
  })
  // The read callback runs synchronously, so `result` is always assigned
  // by the time we reach this line.
  return result!
}
