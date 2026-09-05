import type { EditorThemeClasses, Klass, LexicalEditor, LexicalNode } from 'lexical'

// Minimal structural view of Lexical editor internals. Verified against Lexical 0.46
// (node_modules/lexical/dist/LexicalEditor.d.ts). Public alternatives checked:
// - editor.isEditable() exists for editability, but no public parent-editor accessor.
// - hasNode/hasNodes/getRegisteredNode exist, but require already knowing the class;
//   there is no public way to enumerate the complete registered node map.
// - There is no public "update in progress" flag.
// - EditorThemeClasses is public, but the theme config object that owns it is not.
// Keep every private access here so a Lexical upgrade touches exactly one place.
type InklingLexicalEditorInternals = LexicalEditor & {
  _config: { theme: EditorThemeClasses }
  _nodes: Map<string, { klass: Klass<LexicalNode> }>
  _parentEditor: LexicalEditor | null
  _updating: boolean
}

export function getParentEditor(editor: LexicalEditor): LexicalEditor | null {
  return (editor as InklingLexicalEditorInternals)._parentEditor
}

export function isNestedEditor(editor: LexicalEditor): boolean {
  return getParentEditor(editor) !== null
}

export function getTopLevelEditor(editor: LexicalEditor): LexicalEditor {
  // Lexical's createEditor factory guarantees an acyclic parent chain, so the
  // cycle guard below is defensive: it prevents an infinite loop if an external
  // mutation ever corrupts the hierarchy.
  const visited = new Set<LexicalEditor>()
  let current: LexicalEditor = editor

  while (true) {
    if (visited.has(current)) {
      throw new Error('Lexical editor hierarchy contains a cycle; cannot resolve top-level editor')
    }
    visited.add(current)

    const parent = getParentEditor(current)
    if (parent === null) {
      return current
    }
    current = parent
  }
}

export function getEditorTheme(editor: LexicalEditor): EditorThemeClasses {
  return (editor as InklingLexicalEditorInternals)._config.theme
}

export function getRegisteredNodeMap(editor: LexicalEditor): Map<string, { klass: Klass<LexicalNode> }> {
  // TODO: open upstream PR to add a public method of getting nodes
  return (editor as InklingLexicalEditorInternals)._nodes
}

export function isEditorUpdating(editor: LexicalEditor): boolean {
  return (editor as InklingLexicalEditorInternals)._updating
}
