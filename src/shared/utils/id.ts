/**
 * Database ids are SQLite `integer` (JS `number`) while the wire uses `idString`;
 * this converts at the perimeter so a bad shape throws early instead of putting
 * `NaN` into a query.
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
