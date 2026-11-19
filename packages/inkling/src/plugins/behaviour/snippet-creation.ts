import type { SnippetSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'

import { $generateJSONFromSelectedNodes } from '@lexical/clipboard'
import { $getNodeByKey, $getSelection, type LexicalEditor, type NodeKey } from 'lexical'

export type SnippetSource = { kind: 'card'; nodeKey: NodeKey } | { kind: 'selection' }
export function $deriveSnippetValue(editor: LexicalEditor, source: SnippetSource): string | undefined {
  if (source.kind === 'card') {
    const node = $getNodeByKey(source.nodeKey)
    if (!node) {
      return undefined
    }
    return JSON.stringify({ nodes: [node.exportJSON()] })
  }
  const selection = $getSelection()
  if (!selection) {
    return undefined
  }
  return JSON.stringify($generateJSONFromSelectedNodes(editor, selection))
}

export function createSnippetFromSource(
  editor: LexicalEditor,
  source: SnippetSource,
  name: string,
  createSnippet: SnippetSettings['createSnippet'],
): boolean {
  if (!createSnippet || !name) {
    return false
  }
  const value = editor.getEditorState().read(() => $deriveSnippetValue(editor, source))
  if (value !== undefined) {
    void createSnippet({ name, value })
  }
  return true
}
