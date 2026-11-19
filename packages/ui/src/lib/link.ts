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
