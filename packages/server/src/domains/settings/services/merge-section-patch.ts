import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function mergeSectionPatch<T extends object>(
  base: T,
  patch: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
): T {
  const result: Record<string, unknown> = { ...unsafeCast<Record<string, unknown>>(base) }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const baseVal = result[key]
    if (isRecord(patchVal) && isRecord(baseVal)) {
      if (seen.has(patchVal)) {
        continue
      }
      seen.add(patchVal)
      result[key] = mergeSectionPatch(baseVal, patchVal, seen)
    } else {
      result[key] = patchVal
    }
  }
  return unsafeCast<T>(result)
}
