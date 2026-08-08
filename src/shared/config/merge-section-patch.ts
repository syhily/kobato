import { unsafeCast } from '@/shared/utils/unsafe-cast'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Deep-merge a Section patch into a base settings object. Records merge
 * recursively; arrays / non-records REPLACE. The single merge for the
 * settings write path — do not fork it.
 */
export function mergeSectionPatch<T extends object>(
  base: T,
  patch: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
): T {
  // T is an arbitrary settings DTO; spreading into a plain record is the
  // canonical shape-preserving copy (the patch only touches existing keys).
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
