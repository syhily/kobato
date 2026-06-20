// Shared headless-editor fixtures for Inkling editor tests.
//
// The established in-repo pattern (see tests/unit/ui/inkling/*.test.tsx) is
// `createHeadlessEditor({ nodes: [...16 nodes...] })`, with the 16-entry
// article node array re-declared in every file. Any drift between those
// copies and the production `ARTICLE_NODES` array silently invalidates the
// test. This helper centralises the node list by importing the real node
// classes (not a copy) so the headless editor always mirrors production.
//
// Usage:
//   import { buildHeadlessArticleEditor, seedParagraph } from '#/_helpers/headless-editor'
//   const editor = buildHeadlessArticleEditor()
//   seedParagraph(editor, 'Hello')

import type { InitialConfigType } from '@lexical/react/LexicalComposer'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  ParagraphNode,
  type LexicalEditor,
  type SerializedEditorState,
} from 'lexical'

import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { CodeBlockNode } from '@/ui/inkling/editor/comment/nodes/CodeBlockNode'
import { InlineMathNode as CommentInlineMathNode } from '@/ui/inkling/editor/comment/nodes/InlineMathNode'
import { MathBlockNode } from '@/ui/inkling/editor/comment/nodes/MathBlockNode'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

/**
 * The article editor's node set. Imported (not copied) from the production
 * node modules so a headless test can never drift from what the real editor
 * registers. Keep in sync with `ARTICLE_NODES` in
 * `article/InklingArticleEditor.tsx` — Phase 2 of the editor refactor will
 * collapse this list and `ARTICLE_NODES` into a single registry.
 */
export const ARTICLE_EDITOR_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  FootnoteRefNode,
  InlineMathNode,
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  MusicCardNode,
  HorizontalRuleCardNode,
  TableCardNode,
  SolutionCardNode,
  TwoColumnCardNode,
]

/**
 * The comment editor's node set. Mirrors `COMMENT_EDITOR_NODES` in
 * `comment/CommentEditor.tsx`.
 */
export const COMMENT_EDITOR_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeBlockNode,
  MathBlockNode,
  CommentInlineMathNode,
]

/**
 * Build a headless article editor. `onError` defaults to `console.error`
 * (matches the existing pattern); override to assert no errors in a test.
 */
export function buildHeadlessArticleEditor(onError?: (e: Error) => void): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'inkling-article-test',
    onError: onError ?? ((e: Error) => console.error(e)),
    nodes: ARTICLE_EDITOR_NODES,
  })
}

/**
 * Build a headless comment editor with the comment-mode node set.
 */
export function buildHeadlessCommentEditor(onError?: (e: Error) => void): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'inkling-comment-test',
    onError: onError ?? ((e: Error) => undefined),
    nodes: COMMENT_EDITOR_NODES,
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
