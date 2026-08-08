/** Safe `rel` for anchors that may open in a new tab: merges `noopener` and
 *  `noreferrer` into any existing `rel` when `target` is `_blank`. */
export function safeRel(target: string | null | undefined, existingRel: string | null | undefined): string | undefined {
  const normalizedRel = existingRel ?? undefined
  if (target !== '_blank') {
    return normalizedRel
  }
  const parts = new Set((normalizedRel ?? '').split(/\s+/).filter(Boolean))
  parts.add('noopener')
  parts.add('noreferrer')
  return [...parts].join(' ')
}
