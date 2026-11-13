import { z } from 'zod'

import { idString } from '@/shared/contracts/primitives'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Merge-patch input contract (RFC 7396 semantics) for every field-update
// procedure. Per field: absent key = leave the column untouched, `null` =
// clear the stored value, any other value = set it. The identity key is
// always `id` (numeric wire id), always required, and NEVER part of the
// patch — it names the row, it cannot be renamed by the update.

/**
 * Build the input schema for a field-update procedure: `{ id, ...patch }`
 * with the identity key enforced and forbidden inside the patch shape.
 */
export function mergePatchInput<P extends z.ZodRawShape>(patch: P) {
  if ('id' in patch) {
    throw new Error('mergePatchInput: the patch shape must not declare the identity key "id"')
  }
  return z.object({ id: idString, ...patch })
}

/**
 * A clearable patch field: absent = untouched, `null` = clear, value = set.
 * Use for every nullable column a caller may legitimately erase.
 */
export function clearable<S extends z.ZodType>(schema: S) {
  return z.union([schema, z.null()]).optional()
}

/**
 * Split a parsed merge-patch input into the identity id and the drizzle-ready
 * patch: only keys the caller actually sent survive (`undefined` dropped,
 * `null` kept so it clears the column).
 */
export function splitMergePatch<T extends { id: string }>(
  input: T,
): { id: string; patch: { [K in keyof Omit<T, 'id'>]?: Exclude<Omit<T, 'id'>[K], undefined> } } {
  const { id, ...rest } = input
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      patch[key] = value
    }
  }
  // Safe: the loop above copies only own defined values of `rest`, so the
  // result is exactly `Omit<T, 'id'>` with `undefined` filtered out.
  return { id, patch: unsafeCast(patch) }
}
