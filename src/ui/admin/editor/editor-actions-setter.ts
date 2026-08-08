import type { EditorActions } from '@/ui/admin/editor/tiptap/editor-actions'

// Module-level so the React compiler doesn't flag a mutation of a hook-returned value.
export function setEditorAction<K extends keyof EditorActions>(
  actions: EditorActions,
  name: K,
  fn: EditorActions[K],
): void {
  actions[name] = fn
}
