import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { createBodyEditorConfig } from '@kobato/editor/lexical-core/create-body-editor-config'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
import { createHeadlessEditor } from '@lexical/headless'

// Double-gate validation for Lexical bodies:
//
//   1. the shared zod whitelist gate (`parseLexicalBody`) — rejects
//      unknown node types, out-of-range text-format bitmasks, unsafe
//      link URLs, and over-deep nesting; strips unknown fields
//   2. a real headless `parseEditorState` over the same JSON — the
//      structural second line of defense (0.45.0 silently DROPS unknown
//      node types instead of throwing, so the zod gate is the primary
//      rejector and the parse gate catches structurally impossible
//      trees / future drift between the dialect and the registered
//      node set)
//
// The headless editor is a module-level lazy singleton built from
// `createBodyEditorConfig` — the single node registry source.

let headlessEditor: ReturnType<typeof createHeadlessEditor> | undefined

function getHeadlessEditor(): ReturnType<typeof createHeadlessEditor> {
  if (headlessEditor === undefined) {
    headlessEditor = createHeadlessEditor(createBodyEditorConfig())
  }
  return headlessEditor
}

/**
 * Validate an arbitrary value as a `LexicalBody`: zod gate first (throws
 * `ZodError` with field paths), then a headless `parseEditorState` (a
 * parse failure rethrows with a path hint). Returns the gate-validated
 * body.
 */
export function validateLexicalBody(value: unknown): LexicalBody {
  const body = parseLexicalBody(value)
  try {
    getHeadlessEditor().parseEditorState(JSON.stringify(body))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Lexical body failed the headless parse gate: ${message}`)
  }
  return body
}

/**
 * A body is "empty" when every top-level node is a paragraph without
 * children — the shape an empty document canonicalizes to (the mapping
 * emits one empty paragraph for an empty PT body, and an editor keeps
 * exactly one empty paragraph after deleting everything).
 */
export function isEmptyLexicalBody(body: LexicalBody): boolean {
  if (body.root.children.length === 0) {
    return true
  }
  return body.root.children.every((node) => node.type === 'paragraph' && node.children.length === 0)
}
