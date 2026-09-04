import type { LexicalEditorState } from '@/shared/lexical/schema'

import { SERVER_FILLED_NODE_FIELDS } from '@/shared/lexical/artifacts'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Semantic equality for Lexical editor states (plan
// docs/plans/inkling-editor-replacement.md, round R9a) — the Lexical
// counterpart of `arePortableTextBodiesEquivalent`
// (`@/shared/pt/bridge/canonicalize`), used by the save pipeline's no-op
// short-circuit (`content/repos/mutate`) and, from R11, the editor shell's
// dirty check.
//
// Semantics: serialize the normalized structure and compare. "Normalized"
// here means the zod-validated shape (both sides MUST already be parsed
// through `lexicalEditorStateSchema` — that pass strips unknown keys and
// pins the required-field shape) minus the server-filled artifact slots
// (`@/shared/lexical/artifacts`), which are recomputed deterministically
// on every save and must not mark a body dirty. Key ORDER is normalized
// away by the sorted-key serializer, so two parses of differently ordered
// JSON compare equal. Unlike the PT fingerprint, empty objects/arrays are
// NOT elided: Lexical serialization is machine-generated and canonical, so
// `{}` vs absent is a real difference worth honoring.

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

/** Semantic equality for conflict/dirty checks over validated states. */
export function areLexicalEditorStatesEquivalent(left: LexicalEditorState, right: LexicalEditorState): boolean {
  return lexicalEditorStateFingerprint(left) === lexicalEditorStateFingerprint(right)
}
