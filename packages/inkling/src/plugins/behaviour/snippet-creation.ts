import { $generateJSONFromSelectedNodes } from '@lexical/clipboard'
import { $getNodeByKey, $getSelection, type LexicalEditor, type NodeKey } from 'lexical'

import type { SnippetSettings } from '@/context/InklingHostIntegrationContext'

// Snippet creation — the headless half of the snippet-creation flow
// (CONTEXT.md "snippet creation"), mirroring snippet-insertion: the two
// derive-value strategies (a whole card vs the current selection), the
// empty-name/missing-host-config guard, and the create call. The toolbars
// (SnippetCreateToolbar, SnippetActionToolbar) keep the input state and
// the close-and-refocus choreography (focusEditorRoot) and call in, so
// the guard/derivation matrix is a synchronous test table instead of
// component mounts.

export type SnippetSource = { kind: 'card'; nodeKey: NodeKey } | { kind: 'selection' }

/**
 * Derives a snippet's serialized value from its source: a whole card
 * (`{ nodes: [node.exportJSON()] }`) or the current selection
 * ($generateJSONFromSelectedNodes). Returns undefined when the source no
 * longer resolves (the node is gone, there is no selection).
 */
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

/**
 * The creation flow: guards the empty name and the missing host port,
 * derives the value, and hands it to the host's createSnippet. Returns
 * false only when the guard fails (the caller stays open); a source that
 * no longer resolves creates nothing but still returns true — the
 * toolbars' original close-always-after-guard behavior.
 */
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
