/**
 * Compute a safe `rel` attribute for an anchor that may open in a new tab.
 *
 * When `target` is `_blank`, the destination page can access `window.opener`
 * unless `rel` contains `noopener` (and `noreferrer` as a broader defense).
 * This helper merges those values into any existing `rel` value.
 */
export function safeRel(target: string | undefined, existingRel: string | undefined): string | undefined {
  if (target !== '_blank') {
    return existingRel
  }
  const parts = new Set((existingRel ?? '').split(/\s+/).filter(Boolean))
  parts.add('noopener')
  parts.add('noreferrer')
  return [...parts].join(' ')
}
