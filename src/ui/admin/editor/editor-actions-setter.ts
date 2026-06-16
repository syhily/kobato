import type { EditorActions } from '@/ui/admin/editor/tiptap/editor-actions'

// Module-level helper to set a property on the editor-actions storage object.
// Extracting this keeps the mutation out of the hook body so the React
// compiler doesn't flag it as "modifying a value returned from a hook".
export function setEditorAction<K extends keyof EditorActions>(
  actions: EditorActions,
  name: K,
  fn: EditorActions[K],
): void {
  actions[name] = fn
}
