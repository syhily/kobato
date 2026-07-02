// Shared headless-editor fixtures for Inkling editor tests.
//
// The established in-repo pattern (see tests/unit/ui/inkling/*.test.tsx) is
// `createHeadlessEditor({ nodes: [...16 nodes...] })`, with the node arrays
// re-declared in every file. This helper centralises the editor construction
// by importing the real production node sets from `nodes/registry.ts` so the
// headless editor always mirrors production — no drift possible.
//
// Usage:
//   import { buildHeadlessArticleEditor, seedParagraph } from '#/_helpers/headless-editor'
//   const editor = buildHeadlessArticleEditor()
//   seedParagraph(editor, 'Hello')

import { createHeadlessEditor } from '@lexical/headless'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  type SerializedEditorState,
} from 'lexical'

import { ARTICLE_NODES, COMMENT_NODES } from '@/ui/inkling/editor/nodes/registry'

/**
 * Build a headless article editor. `onError` defaults to `console.error`
 * (matches the existing pattern); override to assert no errors in a test.
 */
export function buildHeadlessArticleEditor(onError?: (e: Error) => void): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'inkling-article-test',
    onError: onError ?? ((e: Error) => console.error(e)),
    nodes: ARTICLE_NODES,
  })
}

/**
 * Build a headless comment editor with the comment-mode node set.
 */
export function buildHeadlessCommentEditor(onError?: (e: Error) => void): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'inkling-comment-test',
    onError: onError ?? ((e: Error) => undefined),
    nodes: COMMENT_NODES,
  })
}

/**
 * Seed the editor with a single paragraph of plain text. Runs inside a
 * discrete `editor.update` so the commit is synchronous (required for
 * headless tests — without `discrete: true`, cross-update reads can return
 * stale state).
 */
export function seedParagraph(editor: LexicalEditor, text: string): void {
  editor.update(
    () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode(text))
      root.append(paragraph)
    },
    { discrete: true },
  )
}

/**
 * Seed the editor from a pre-built serialized state (typically a serialised
 * Inkling document's root, or a hand-constructed `SerializedEditorState`).
 * Use this when a test needs a specific node tree (cards, footnotes, nested
 * lists).
 */
export function seedFromRoot(editor: LexicalEditor, state: SerializedEditorState): void {
  editor.setEditorState(editor.parseEditorState(state))
}

/**
 * Run a read callback inside the editor's current state. Every Lexical read
 * must happen inside `editor.getEditorState().read(...)` — this is the
 * typed wrapper so tests don't forget the boundary.
 */
export function readEditorState<T>(editor: LexicalEditor, fn: () => T): T {
  return editor.getEditorState().read(fn)
}
