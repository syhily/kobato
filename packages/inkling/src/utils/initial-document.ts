import type { InitialEditorStateType, SerializedEditorState, SerializedParagraphNode } from 'lexical'

import { $createParagraphNode, $getRoot } from 'lexical'

// The minimal valid Inkling document exists in two payload dialects:
// - `MINIMAL_DOCUMENT` — the full dialect, exactly what a live editor's `editorState.toJSON()`
//   produces for an empty document (`textFormat: 0` and `textStyle: ''` present), so an empty
//   HTML import is indistinguishable from a real empty-editor export.
// - `MINIMAL_DOCUMENT_LEGACY_PAYLOAD` — the legacy dialect, without `textFormat`/`textStyle`;
//   bootstrap/repair feeds it straight into an editor.
// `SerializedParagraphNode` declares those fields required, but `ParagraphNode.importJSON`
// treats them as optional, so both dialects parse to equivalent editor states.

const FULL_EMPTY_PARAGRAPH: SerializedParagraphNode = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  // oxlint-disable-next-line typescript/no-deprecated -- persisted payloads carry version and a live export still emits it; dropping it changes the stored shape
  version: 1,
}

const LEGACY_EMPTY_PARAGRAPH = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
}

export const MINIMAL_DOCUMENT: SerializedEditorState = {
  root: {
    children: [FULL_EMPTY_PARAGRAPH],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    // oxlint-disable-next-line typescript/no-deprecated -- see the note on FULL_EMPTY_PARAGRAPH
    version: 1,
  },
}

export const MINIMAL_DOCUMENT_LEGACY_PAYLOAD = {
  root: {
    children: [LEGACY_EMPTY_PARAGRAPH],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

/*
 * The two HTML-string → editor-content paths normalize differently on purpose: the public
 * `htmlToLexical` import runs on a one-shot headless editor with `registerDefaultTransforms`,
 * while nested editors (`generateEditorState`) register none — a node transform on a
 * long-lived editor persists and would re-run on every later edit, not just the initial fill.
 */

function hasRootChildren(value: unknown): value is { root: { children: unknown[] } } {
  if (typeof value !== 'object' || value === null || !('root' in value)) {
    return false
  }

  const { root } = value
  return typeof root === 'object' && root !== null && 'children' in root && Array.isArray(root.children)
}

function repairSerializedEmptyRoot(value: unknown): boolean {
  if (!hasRootChildren(value) || value.root.children.length > 0) {
    return false
  }

  value.root.children.push({ ...LEGACY_EMPTY_PARAGRAPH })
  return true
}

export function $appendEmptyParagraph(): void {
  $getRoot().append($createParagraphNode())
}

export type InklingInitialEditorState = InitialEditorStateType | SerializedEditorState
export function normalizeInitialEditorState(
  initialEditorState: InklingInitialEditorState | undefined,
): InitialEditorStateType | undefined {
  if (initialEditorState === null || initialEditorState === undefined || typeof initialEditorState === 'function') {
    return initialEditorState
  }
  if (typeof initialEditorState === 'string') {
    const parsed: unknown = JSON.parse(initialEditorState)

    if (repairSerializedEmptyRoot(parsed)) {
      return JSON.stringify(parsed)
    }

    return initialEditorState
  }

  if (!('root' in initialEditorState)) {
    return initialEditorState
  }

  const cloned: unknown = JSON.parse(JSON.stringify(initialEditorState))
  repairSerializedEmptyRoot(cloned)

  return JSON.stringify(cloned)
}
