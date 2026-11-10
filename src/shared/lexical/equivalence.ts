import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { SERVER_FILLED_NODE_FIELDS } from '@/shared/lexical/artifacts'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Semantic equality for Lexical editor states — the save pipeline's no-op
// short-circuit (`content/repos/mutate`) and the editor shell's dirty check.
//
// Both sides MUST already be parsed through `lexicalEditorStateSchema`: that
// pass strips unknown keys and pins the required-field shape. Server-filled
// artifact slots (`@/shared/lexical/artifacts`) are excluded — they are
// recomputed deterministically on every save and must not mark a body dirty.
// Key order is normalized away by the sorted-key serializer; empty
// objects/arrays are NOT elided: Lexical serialization is canonical, so `{}`
// vs absent is a real difference worth honoring.

type Json = string | number | boolean | null | { [k: string]: Json } | Json[]

function semanticJson(value: unknown): Json {
  if (Array.isArray(value)) {
    return value.map(semanticJson)
  }
  if (isRecord(value)) {
    const dropped = typeof value.type === 'string' ? SERVER_FILLED_NODE_FIELDS[value.type] : undefined
    const out: { [k: string]: Json } = {}
    for (const key of Object.keys(value).sort()) {
      if (dropped?.includes(key) === true) {
        continue
      }
      out[key] = semanticJson(value[key])
    }
    return out
  }
  // Post-zod states carry only JSON primitives at the leaves.
  return unsafeCast<Json>(value)
}

/** Stable semantics-only fingerprint of a validated editor state. */
export function lexicalEditorStateFingerprint(state: LexicalEditorState): string {
  return JSON.stringify(semanticJson(state))
}

/** Per-node variant for the body diff's LCS anchors: two nodes with the same
 * fingerprint render as 'unchanged' rows. Same normalization rules as the
 * whole-state fingerprint. */
export function lexicalNodeFingerprint(node: LexicalNodeJson): string {
  return JSON.stringify(semanticJson(node))
}

/** Semantic equality for conflict/dirty checks over validated states. */
export function areLexicalEditorStatesEquivalent(left: LexicalEditorState, right: LexicalEditorState): boolean {
  return lexicalEditorStateFingerprint(left) === lexicalEditorStateFingerprint(right)
}
