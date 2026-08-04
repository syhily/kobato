import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { createCommentEditorConfig } from '@kobato/editor/lexical-core/create-comment-editor-config'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { createHeadlessEditor } from '@lexical/headless'

// Double-gate validation for Lexical comment bodies — the mirror of
// `lexical-core/validate.ts` over the comment node subset:
//
//   1. the shared zod whitelist gate (`parseLexicalCommentBody`) —
//      rejects unknown node types (headings / images / tables /
//      footnotes / …), out-of-range text-format bitmasks, unsafe link
//      URLs, `check` lists and over-deep list nesting; strips unknown
//      fields
//   2. a real headless `parseEditorState` over the same JSON with the
//      comment registry — 0.45.0 silently DROPS unknown node types, so
//      the zod gate is the primary rejector and the parse gate catches
//      structurally impossible trees / future drift between the dialect
//      and the registered node set
//
// The headless editor is a module-level lazy singleton built from
// `createCommentEditorConfig` — the single comment node registry source.

let headlessEditor: ReturnType<typeof createHeadlessEditor> | undefined

function getHeadlessEditor(): ReturnType<typeof createHeadlessEditor> {
  if (headlessEditor === undefined) {
    headlessEditor = createHeadlessEditor(createCommentEditorConfig())
  }
  return headlessEditor
}

/**
 * Validate an arbitrary value as a `LexicalCommentBody`: zod gate first
 * (throws `ZodError` with field paths), then a headless
 * `parseEditorState` (a parse failure rethrows with a path hint).
 * Returns the gate-validated body.
 */
export function validateLexicalCommentBody(value: unknown): LexicalCommentBody {
  const body = parseLexicalCommentBody(value)
  try {
    getHeadlessEditor().parseEditorState(JSON.stringify(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Lexical comment body failed the headless parse gate: ${message}`)
  }
  return body
}
