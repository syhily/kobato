/** Parse a numeric string into a number id.
 *
 * All database ids are SQLite `integer` (JS `number`). The wire format
 * uses `idString` (Zod `z.string().regex(/^\d+$/)`) so clients never
 * have to care about the representation. This helper centralises the
 * conversion at the controller perimeter and validates the shape so a
 * malformed string throws early with a clear message instead of a raw
 * `NaN` propagating into a query.
 */
export function idFromString(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Invalid id number: ${value}`)
    }
    return value
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new TypeError(`Invalid id string: ${value}`)
  }
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`Id exceeds the safe integer range: ${value}`)
  }
  return parsed
}

/** Serialize an id for the wire (inverse of `idFromString`). */
export function idToString(value: number): string {
  return String(value)
}
