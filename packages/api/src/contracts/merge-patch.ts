import { idString } from '@kobato/api/contracts/primitives'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { z } from 'zod'

export function mergePatchInput<P extends z.ZodRawShape>(patch: P) {
  if ('id' in patch) {
    throw new Error('mergePatchInput: the patch shape must not declare the identity key "id"')
  }
  return z.object({ id: idString, ...patch })
}

export function clearable<S extends z.ZodType>(schema: S) {
  return z.union([schema, z.null()]).optional()
}

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
  return { id, patch: unsafeCast(patch) }
}
