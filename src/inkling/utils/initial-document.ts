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

// not SerializedParagraphNode: this dialect omits textFormat/textStyle on purpose (see above)
const LEGACY_EMPTY_PARAGRAPH = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
}

/** The minimal valid document in the full dialect — what an empty live editor serializes to. */
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

/** The minimal valid document in the legacy payload dialect (see the dialect note above). */
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

// Empty-root repair, serialized side: a root with no children won't accept focus, so seed
// the legacy dialect's paragraph.
function repairSerializedEmptyRoot(value: unknown): boolean {
  if (!hasRootChildren(value) || value.root.children.length > 0) {
    return false
  }

  value.root.children.push({ ...LEGACY_EMPTY_PARAGRAPH })
  return true
}

/** Empty-root repair, live-editor side: an empty root won't accept focus. Must run inside `editor.update()`. */
export function $appendEmptyParagraph(): void {
  $getRoot().append($createParagraphNode())
}

/**
 * The initial editor state accepted by `<InklingComposer>`: the shapes Lexical supports,
 * plus a plain serialized editor-state object (normalized to JSON before reaching Lexical).
 */
export type InklingInitialEditorState = InitialEditorStateType | SerializedEditorState

/**
 * Normalizes the public `initialEditorState` prop into `InitialEditorStateType`. The
 * caller's serialized object is never mutated.
 */
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

  // an `EditorState` instance has no `root` property — hand it to Lexical as-is
  if (!('root' in initialEditorState)) {
    return initialEditorState
  }

  // clone so the caller's serialized object is never mutated
  const cloned: unknown = JSON.parse(JSON.stringify(initialEditorState))
  repairSerializedEmptyRoot(cloned)

  return JSON.stringify(cloned)
}
