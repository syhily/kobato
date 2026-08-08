/**
 * All database ids are SQLite `integer` (JS `number`); the wire format uses `idString`
 * so clients never care about the representation. Centralised conversion at the controller
 * perimeter validates the shape (clear early error instead of a `NaN` in a query).
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
