import type { LexicalEditorState, LexicalNodeJson } from '@kobato/inkling-internal/headless/schema'

import { SERVER_FILLED_NODE_FIELDS } from '@kobato/inkling-internal/headless/artifacts'
import { isRecord } from '@kobato/utils/type-guards'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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
  return unsafeCast<Json>(value)
}

export function lexicalEditorStateFingerprint(state: LexicalEditorState): string {
  return JSON.stringify(semanticJson(state))
}

export function lexicalNodeFingerprint(node: LexicalNodeJson): string {
  return JSON.stringify(semanticJson(node))
}

export function areLexicalEditorStatesEquivalent(left: LexicalEditorState, right: LexicalEditorState): boolean {
  return lexicalEditorStateFingerprint(left) === lexicalEditorStateFingerprint(right)
}
