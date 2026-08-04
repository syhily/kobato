import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { transformAutoLinkToLink } from '@kobato/shared/lexical/autolink-transform'
import { createBodyEditorConfig } from '@kobato/shared/lexical/body-config'
import { synchronizeFootnoteIndicesLexical } from '@kobato/shared/lexical/footnote-sync-lexical'
import { normalizeLexicalQuoteChildren } from '@kobato/shared/lexical/quote-normalize'
import { validateLexicalBody } from '@kobato/shared/lexical/validate'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createHeadlessEditor } from '@lexical/headless'

// Canonical shape of a Lexical body — deterministic and idempotent.
//
//   0. `normalizeLexicalQuoteChildren` — the editor's 0.45
//      `$setBlocksType` quote conversion serializes quotes with bare
//      inline children (text-in-quote); the dialect requires
//      paragraphs, so bare inline runs are wrapped first (see
//      `@kobato/shared/lexical/quote-normalize`). List items need no
//      wrap: the dialect accepts both the paragraph alias and the
//      runtime inline children, and the parse round-trip below
//      canonicalizes the paragraph alias away (0.45 `ListItemNode.append`
//      unwraps paragraphs).
//   1. `transformAutoLinkToLink` — autolink nodes (serialized
//      `type: 'autolink'`, same fields as LinkNode) rewrite into regular
//      links BEFORE the gate, so the dialect never sees the unadmitted
//      type (see `@kobato/shared/lexical/autolink-transform`).
//   2. `validateLexicalBody` — the zod gate + headless parse double
//      check (rejects unknown types / bad bitmasks / unsafe URLs /
//      over-deep nesting)
//   3. `synchronizeFootnoteIndicesLexical` — footnote refs and
//      definitions renumbered by first citation order, definitions
//      moved to the end (pure JSON, no mutation)
//   4. headless `parseEditorState` → `toJSON` — the deterministic
//      0.45.0 serialized form: every node re-emitted through its
//      registered `exportJSON` (paragraphs gain `textFormat` /
//      `textStyle`, links `title: null`, cells `backgroundColor:
//      null`, list items keep their runtime inline children, unknown
//      keys gone)
//
// The headless editor is the same lazy singleton as `validate.ts`.

let headlessEditor: ReturnType<typeof createHeadlessEditor> | undefined

function getHeadlessEditor(): ReturnType<typeof createHeadlessEditor> {
  if (headlessEditor === undefined) {
    headlessEditor = createHeadlessEditor(createBodyEditorConfig())
  }
  return headlessEditor
}

/**
 * Canonical Lexical body for a given input. Throws on invalid input
 * (ZodError from the gate, or a wrapped parse error).
 */
export function canonicalizeLexicalBodyShape(json: unknown): LexicalBody {
  const normalized = normalizeLexicalQuoteChildren(json)
  const withLinks = transformAutoLinkToLink(normalized)
  const body = validateLexicalBody(withLinks)
  const synced = synchronizeFootnoteIndicesLexical(body)
  const state = getHeadlessEditor().parseEditorState(JSON.stringify(synced))
  // `toJSON()` types as the generic 0.45.0 serialized state; the dialect
  // gates the shape beforehand, so the cast is structural.
  return unsafeCast<LexicalBody>(state.toJSON())
}

/**
 * Semantic equality helper for conflict detection / "dirty" checks —
 * canonical forms are deep-compared, so equivalent list shapes, missing
 * optional fields and footnote index drift do not trigger false
 * positives. Key order is deterministic (each node class emits its
 * fields in a fixed order), so a plain `JSON.stringify` comparison is
 * stable.
 */
export function areLexicalBodiesEquivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeLexicalBodyShape(left)) === JSON.stringify(canonicalizeLexicalBodyShape(right))
}
