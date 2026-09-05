import type { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import type { SerializedEditorState, SerializedParagraphNode } from 'lexical'

import { $createParagraphNode, $getRoot } from 'lexical'

/**
 * The initial document — the one module owning the minimal valid Inkling
 * document (a root holding a single empty paragraph) and the bootstrap flow
 * that lands initial content in an editor. The document exists in two
 * payload dialects:
 *
 * - `MINIMAL_DOCUMENT` — the full dialect: exactly what a live editor's
 *   `editorState.toJSON()` produces for an empty document, with the
 *   paragraph's `textFormat: 0` and `textStyle: ''` present. The public HTML
 *   import returns this shape so an empty import is indistinguishable from a
 *   real empty-editor export.
 * - `MINIMAL_DOCUMENT_LEGACY_PAYLOAD` — the historical payload dialect,
 *   without the paragraph's `textFormat`/`textStyle`.
 *   `SerializedParagraphNode` declares those fields required, but
 *   `ParagraphNode.importJSON` treats them as optional — so host payloads
 *   that predate them still parse, and the bootstrap/repair paths below keep
 *   emitting this shape so stored payloads stay in the shape hosts already
 *   have.
 *
 * The two dialects parse to equivalent editor states (importJSON supplies the
 * defaults); they differ in payload shape only. Call sites (HTML import,
 * composer bootstrap, nested editors) adapt over these constants instead of
 * restating the literal.
 */

const FULL_EMPTY_PARAGRAPH: SerializedParagraphNode = {
  children: [],
  direction: null,
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  type: 'paragraph',
  version: 1,
}

// not SerializedParagraphNode: the historical dialect omits the required
// textFormat/textStyle on purpose (see the dialect note above)
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
    version: 1,
  },
}

/** The minimal valid document in the historical payload dialect (see the dialect note above). */
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
 * **Transform-policy note** — two paths turn an HTML string into editor
 * content, and they normalize differently on purpose:
 *
 * - the public `htmlToLexical` import (src/html/html-to-lexical) runs on a
 *   one-shot headless editor and registers `registerDefaultTransforms`
 *   (denest / merge-lists / remove-alignment), so imported markup is
 *   structurally repaired during the import;
 * - nested-editor population (`generateEditorState`) registers no transforms,
 *   because its editors are long-lived: a node transform registered on a live
 *   editor persists for the editor's whole lifetime and would re-run on every
 *   later edit (stripping paragraph alignment, denesting on each update), not
 *   just normalize the initial fill.
 *
 * Whether nested population should adopt the import-time policy is an open
 * question — until it is decided, keep the divergence.
 */

function hasRootChildren(value: unknown): value is { root: { children: unknown[] } } {
  if (typeof value !== 'object' || value === null || !('root' in value)) {
    return false
  }

  const { root } = value
  return typeof root === 'object' && root !== null && 'children' in root && Array.isArray(root.children)
}

/**
 * Empty-root repair, serialized side: a root with no children won't accept
 * focus, so seed it with the minimal document's paragraph. The repair emits
 * the historical payload dialect (see the dialect note above). Returns
 * whether a repair happened so the caller knows to re-serialize.
 */
function repairSerializedEmptyRoot(value: unknown): boolean {
  if (!hasRootChildren(value) || value.root.children.length > 0) {
    return false
  }

  value.root.children.push({ ...LEGACY_EMPTY_PARAGRAPH })
  return true
}

/**
 * Empty-root repair, live-editor side: append the minimal document's
 * paragraph — a completely empty root won't accept focus. Must run inside
 * `editor.update()`.
 */
export function $appendEmptyParagraph(): void {
  $getRoot().append($createParagraphNode())
}

/**
 * The initial editor state accepted by `<InklingComposer>`. In addition to the
 * shapes Lexical itself supports, a plain serialized editor-state object may be
 * passed for convenience — it is normalized to a JSON string before reaching
 * Lexical.
 */
export type InklingInitialEditorState = InitialEditorStateType | SerializedEditorState

/**
 * Normalize the public `initialEditorState` prop into the `InitialEditorStateType`
 * Lexical accepts, so the single-editor and collaboration paths share one value:
 *
 * - `null`/`undefined`, `EditorState` instances, and initializer functions pass
 *   through unchanged;
 * - JSON strings are parsed only to detect and repair an empty root (the editor
 *   needs at least one paragraph node), then returned as strings;
 * - serialized objects are cloned — never mutated — repaired the same way, and
 *   returned as JSON strings.
 *
 * Malformed JSON strings throw from `JSON.parse`, as they did before.
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
