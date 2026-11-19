import type { EditorThemeClasses, Klass, LexicalEditor, LexicalNode } from 'lexical'

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
  return (editor as InklingLexicalEditorInternals)._nodes
}

export function isEditorUpdating(editor: LexicalEditor): boolean {
  return (editor as InklingLexicalEditorInternals)._updating
}
