import type { PortableTextBody } from '@/shared/pt/schema'

import { pmDocToBody } from '@/shared/pt/bridge/pm-to-pt'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'
import { portableTextBlockSemanticFingerprint } from '@/shared/pt/semantics'

/**
 * Canonicalise a PortableText body through the PT↔PM bridge, collapsing
 * representational differences (e.g. omitted vs explicit `level: 1`).
 */
function canonicalizePortableTextBodyShape(body: PortableTextBody): PortableTextBody {
  return pmDocToBody(bodyToPmDoc(body))
}

/** Semantic equality for conflict/dirty checks: canonical PT forms so equivalent list shapes don't false-mismatch. */
export function arePortableTextBodiesEquivalent(left: PortableTextBody, right: PortableTextBody): boolean {
  const canonLeft = canonicalizePortableTextBodyShape(left)
  const canonRight = canonicalizePortableTextBodyShape(right)
  if (canonLeft.length !== canonRight.length) {
    return false
  }
  for (let i = 0; i < canonLeft.length; i++) {
    if (portableTextBlockSemanticFingerprint(canonLeft[i]) !== portableTextBlockSemanticFingerprint(canonRight[i])) {
      return false
    }
  }
  return true
}
