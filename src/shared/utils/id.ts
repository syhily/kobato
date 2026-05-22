/** Parse a numeric string into a bigint id.
 *
 * All database ids are `bigserial` / `bigint`. The wire format uses
 * `idString` (Zod `z.string().regex(/^\d+$/)`) so JSON serialization
 * never hits the `BigInt` JSON-rejection path. This helper centralises
 * the conversion at the controller perimeter and validates the shape so
 * a malformed string throws early with a clear message instead of a
 * raw `SyntaxError: Cannot convert ... to a BigInt`.
 */
export function idFromString(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new TypeError(`Invalid id number: ${value}`)
    }
    return BigInt(value)
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new TypeError(`Invalid id string: ${value}`)
  }
  return BigInt(trimmed)
}
