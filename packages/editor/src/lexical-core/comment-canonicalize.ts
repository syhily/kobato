import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { validateLexicalCommentBody } from '@kobato/editor/lexical-core/comment-validate'
import { createCommentEditorConfig } from '@kobato/editor/lexical-core/create-comment-editor-config'
import { normalizeLexicalQuoteChildren } from '@kobato/shared/lexical/quote-normalize'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createHeadlessEditor } from '@lexical/headless'

// Canonical shape of a Lexical comment body — deterministic and
// idempotent (the comment-track counterpart of
// `lexical-core/canonicalize.ts`; no footnote sync — comments carry no
// footnote registry):
//
//   0. `normalizeLexicalQuoteChildren` — the editor's 0.45
//      `$setBlocksType` quote conversion serializes quotes with bare
//      inline children (text-in-quote); the dialect requires
//      paragraphs, so bare inline runs are wrapped first (see
//      `@kobato/shared/lexical/quote-normalize`). List items need no
//      wrap: the dialect accepts their inline runtime children, and the
//      parse round-trip below canonicalizes the paragraph alias away.
//   1. `validateLexicalCommentBody` — the zod gate + headless parse
//      double check
//   2. headless `parseEditorState` → `toJSON` — the deterministic
//      0.45.0 serialized form: every node re-emitted through its
//      registered `exportJSON` (paragraphs gain `textFormat` /
//      `textStyle`, links `title: null`, unknown keys gone)
//
// The headless editor is the same lazy singleton pattern as
// `comment-validate.ts`.

let headlessEditor: ReturnType<typeof createHeadlessEditor> | undefined

function getHeadlessEditor(): ReturnType<typeof createHeadlessEditor> {
  if (headlessEditor === undefined) {
    headlessEditor = createHeadlessEditor(createCommentEditorConfig())
  }
  return headlessEditor
}

/**
 * Canonical Lexical comment body for a given input. Throws on invalid
 * input (ZodError from the gate, or a wrapped parse error).
 */
export function canonicalizeLexicalCommentBodyShape(json: unknown): LexicalCommentBody {
  const normalized = normalizeLexicalQuoteChildren(json)
  const body = validateLexicalCommentBody(normalized)
  const state = getHeadlessEditor().parseEditorState(JSON.stringify(body))
  // `toJSON()` types as the generic 0.45.0 serialized state; the dialect
  // gates the shape beforehand, so the cast is structural.
  return unsafeCast<LexicalCommentBody>(state.toJSON())
}

/**
 * Semantic equality helper for conflict detection / "dirty" checks —
 * canonical forms are deep-compared, so missing optional fields do not
 * trigger false positives. Key order is deterministic (each node class
 * emits its fields in a fixed order), so a plain `JSON.stringify`
 * comparison is stable.
 */
export function areLexicalCommentBodiesEquivalent(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalizeLexicalCommentBodyShape(left)) ===
    JSON.stringify(canonicalizeLexicalCommentBodyShape(right))
  )
}
